<?php
declare(strict_types=1);

function cfg(): array
{
    static $config;
    if (!$config) {
        $config = require __DIR__ . '/config.php';
    }
    return $config;
}

function start_gate(): void
{
    session_set_cookie_params([
        'lifetime' => 14 * 86400,
        'path' => '/',
        'secure' => true,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_name('ofdeck');
    session_start();
}

function logged_in(): bool
{
    return !empty($_SESSION['ok']);
}

function client_ip(): string
{
    $ip = (string)($_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? '');
    return substr((string)preg_replace('/[^0-9a-fA-F:.]/', '', $ip), 0, 64);
}

function cache_dir(): string
{
    $dir = dirname(__DIR__) . '/cache';
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
    return $dir;
}

function fail_path(): string
{
    return cache_dir() . '/fails.json';
}

function fail_rows(): array
{
    $path = fail_path();
    if (!is_file($path)) {
        return [];
    }
    $rows = json_decode((string)file_get_contents($path), true);
    return is_array($rows) ? $rows : [];
}

function locked_out(): bool
{
    $row = fail_rows()[client_ip()] ?? ['n' => 0, 't' => 0];
    if (time() - (int)($row['t'] ?? 0) > 900) {
        return false;
    }
    return (int)($row['n'] ?? 0) >= 8;
}

function note_fail(): void
{
    $rows = fail_rows();
    $ip = client_ip();
    $row = $rows[$ip] ?? ['n' => 0, 't' => time()];
    if (time() - (int)($row['t'] ?? 0) > 900) {
        $row = ['n' => 0, 't' => time()];
    }
    $row['n'] = (int)$row['n'] + 1;
    $rows[$ip] = $row;
    file_put_contents(fail_path(), json_encode($rows));
}

function clear_fail(): void
{
    $rows = fail_rows();
    unset($rows[client_ip()]);
    file_put_contents(fail_path(), json_encode($rows));
}

function password_ok(string $given): bool
{
    return hash_equals(hash('sha256', (string)cfg()['password']), hash('sha256', $given));
}

function gate_key(): string
{
    return hash('sha256', 'gate|' . (string)(cfg()['live_key'] ?? ''), true);
}

function gate_bits(): int
{
    return 16;
}

function gate_mac(string $id, int $ts, int $bits): string
{
    return hash_hmac('sha256', 'pow|' . $id . '|' . $ts . '|' . $bits, gate_key());
}

function issue_path(): string
{
    return cache_dir() . '/gates.json';
}

function issue_rows(): array
{
    $path = issue_path();
    if (!is_file($path)) {
        return [];
    }
    $rows = json_decode((string)file_get_contents($path), true);
    return is_array($rows) ? $rows : [];
}

function too_many_gates(): bool
{
    $row = issue_rows()[client_ip()] ?? ['n' => 0, 't' => 0];
    if (time() - (int)($row['t'] ?? 0) > 900) {
        return false;
    }
    return (int)($row['n'] ?? 0) >= 40;
}

function note_gate_issue(): void
{
    $rows = issue_rows();
    $ip = client_ip();
    $row = $rows[$ip] ?? ['n' => 0, 't' => time()];
    if (time() - (int)($row['t'] ?? 0) > 900) {
        $row = ['n' => 0, 't' => time()];
    }
    $row['n'] = (int)$row['n'] + 1;
    $rows[$ip] = $row;
    file_put_contents(issue_path(), json_encode($rows), LOCK_EX);
}

function issue_gate(): array
{
    $id = bin2hex(random_bytes(16));
    $ts = time();
    $bits = gate_bits();
    return [
        'id' => $id,
        'ts' => $ts,
        'bits' => $bits,
        'mac' => gate_mac($id, $ts, $bits),
    ];
}

function leading_zero_bits(string $hex): int
{
    $bits = 0;
    $len = strlen($hex);
    for ($i = 0; $i < $len; $i++) {
        $n = hexdec($hex[$i]);
        if ($n === 0) {
            $bits += 4;
            continue;
        }
        if ($n < 2) {
            return $bits + 3;
        }
        if ($n < 4) {
            return $bits + 2;
        }
        if ($n < 8) {
            return $bits + 1;
        }
        return $bits;
    }
    return $bits;
}

function take_gate(string $id): bool
{
    if (!preg_match('/^[a-f0-9]{32}$/', $id)) {
        return false;
    }
    $dir = cache_dir() . '/g';
    if (!is_dir($dir) && !mkdir($dir, 0700, true) && !is_dir($dir)) {
        return false;
    }
    $path = $dir . '/' . $id;
    $fh = @fopen($path, 'x');
    if ($fh === false) {
        return false;
    }
    fwrite($fh, (string)time());
    fclose($fh);
    return true;
}

function proof_ok(array $post): bool
{
    if ((string)($post['website'] ?? '') !== '') {
        return false;
    }
    $id = strtolower((string)($post['id'] ?? ''));
    $ts = (int)($post['ts'] ?? 0);
    $bits = (int)($post['bits'] ?? 0);
    $mac = strtolower((string)($post['mac'] ?? ''));
    $n = (string)($post['n'] ?? '');
    if ($bits !== gate_bits() || !preg_match('/^[a-f0-9]{32}$/', $id) || !preg_match('/^[0-9]{1,12}$/', $n)) {
        return false;
    }
    if ($ts < time() - 120 || $ts > time() + 30) {
        return false;
    }
    $expected = gate_mac($id, $ts, $bits);
    if (!hash_equals($expected, $mac)) {
        return false;
    }
    if (!take_gate($id)) {
        return false;
    }
    $hash = hash('sha256', $id . ':' . $n);
    return leading_zero_bits($hash) >= $bits;
}

function admin_password_ok(string $given): bool
{
    $secret = (string)(cfg()['admin_password'] ?? '');
    if (strlen($secret) < 12) {
        return false;
    }
    return hash_equals(hash('sha256', $secret), hash('sha256', $given));
}

function admin_logged_in(): bool
{
    return !empty($_SESSION['admin']);
}

function require_admin(): void
{
    start_gate();
    if (!admin_logged_in()) {
        json_out(['error' => 'auth'], 401);
    }
}

function json_out($data, int $code = 200): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Robots-Tag: noindex, nofollow, noarchive, nosnippet');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function require_login(): void
{
    start_gate();
    if (!logged_in()) {
        json_out(['error' => 'auth'], 401);
    }
}

function atomic_write(string $path, string $payload): bool
{
    $tmp = $path . '.tmp';
    if (file_put_contents($tmp, $payload, LOCK_EX) === false) {
        return false;
    }
    return rename($tmp, $path) || (@unlink($path) === true && rename($tmp, $path));
}

function curl_handle(string $path)
{
    $ch = curl_init('https://api.openfront.io' . $path);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => 25,
        CURLOPT_HTTPHEADER => ['Accept: application/json', 'User-Agent: of-deck'],
    ]);
    return $ch;
}

function api_json(string $path): array
{
    $last = new RuntimeException('OpenFront');
    for ($try = 0; $try < 3; $try++) {
        $ch = curl_handle($path);
        $raw = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($raw !== false && $code === 200) {
            $data = json_decode((string)$raw, true);
            if (is_array($data)) {
                return $data;
            }
            $last = new RuntimeException('JSON');
        } else {
            $last = new RuntimeException('OpenFront ' . $code);
            if ($code >= 400 && $code < 500 && $code !== 429) {
                throw $last;
            }
        }
        if ($try < 2) {
            usleep(300000 * ($try + 1));
        }
    }
    throw $last;
}

function api_many(array $paths): array
{
    if (!$paths) {
        return [];
    }
    $mh = curl_multi_init();
    $handles = [];
    foreach ($paths as $i => $path) {
        $ch = curl_handle($path);
        curl_multi_add_handle($mh, $ch);
        $handles[$i] = $ch;
    }
    do {
        $status = curl_multi_exec($mh, $running);
        if ($running) {
            curl_multi_select($mh, 1.0);
        }
    } while ($running && $status === CURLM_OK);
    $out = [];
    foreach ($handles as $i => $ch) {
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $raw = curl_multi_getcontent($ch);
        curl_multi_remove_handle($mh, $ch);
        curl_close($ch);
        if ($code !== 200) {
            throw new RuntimeException('OpenFront ' . $code);
        }
        $data = json_decode((string)$raw, true);
        if (!is_array($data)) {
            throw new RuntimeException('JSON');
        }
        $out[$i] = $data;
    }
    curl_multi_close($mh);
    return $out;
}

function page_url(string $pathname, array $extra, int $page): string
{
    $params = $extra;
    $params['page'] = (string)$page;
    $params['limit'] = '50';
    return $pathname . '?' . http_build_query($params);
}

function all_pages(string $pathname, array $extra): array
{
    $first = api_json(page_url($pathname, $extra, 1));
    $total = (int)($first['total'] ?? count($first['results'] ?? []));
    $results = $first['results'] ?? [];
    $pages = min(30, (int)ceil($total / 50));
    if ($pages > 1) {
        $paths = [];
        for ($page = 2; $page <= $pages; $page++) {
            $paths[] = page_url($pathname, $extra, $page);
        }
        foreach (api_many($paths) as $page) {
            foreach ($page['results'] ?? [] as $row) {
                $results[] = $row;
            }
        }
    }
    return ['total' => $total, 'results' => $results];
}
