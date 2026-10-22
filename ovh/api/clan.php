<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
require_login();

const CLAN = 'GAL';

function sum_roster(array $members): array
{
    $modes = ['total', 'ffa', 'team', 'hvn', 'duos', 'trios', 'quads', '2', '3', '4', '5', '6', '7', 'ranked', '1v1'];
    $stats = [];
    foreach ($modes as $mode) {
        $stats[$mode] = ['wins' => 0, 'losses' => 0];
    }
    $roles = ['leader' => 0, 'officer' => 0, 'member' => 0];
    foreach ($members as $member) {
        $role = (string)($member['role'] ?? '');
        $roles[$role] = ($roles[$role] ?? 0) + 1;
        foreach ($modes as $mode) {
            $row = $member['stats'][$mode] ?? null;
            if (!is_array($row)) {
                continue;
            }
            $stats[$mode]['wins'] += (int)($row['wins'] ?? 0);
            $stats[$mode]['losses'] += (int)($row['losses'] ?? 0);
        }
    }
    return ['roles' => $roles, 'stats' => $stats];
}

function utc_iso(DateTimeImmutable $date): string
{
    return $date->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\TH:i:s.v\Z');
}

function paris_start(string $ymd): DateTimeImmutable
{
    return new DateTimeImmutable($ymd . ' 00:00:00', new DateTimeZone('Europe/Paris'));
}

function resolve_range(string $from, string $to, bool $untilNow): array
{
    if ($from === '' && $to === '' && !$untilNow) {
        $end = new DateTimeImmutable('now');
        return ['start' => $end->modify('-1 day'), 'end' => $end, 'rolling' => true];
    }
    if (($from !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $from)) || ($to !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $to))) {
        throw new InvalidArgumentException('Date invalide.');
    }
    $start = paris_start($from !== '' ? $from : $to);
    if ($untilNow || $to === '') {
        $end = new DateTimeImmutable('now');
    } else {
        $dayEnd = paris_start($to)->modify('+1 day')->modify('-1 second');
        $now = new DateTimeImmutable('now');
        $end = $dayEnd < $now ? $dayEnd : $now;
    }
    if ($end < $start) {
        throw new InvalidArgumentException('La fin est avant le début.');
    }
    if ($end->getTimestamp() - $start->getTimestamp() > 14 * 86400) {
        throw new InvalidArgumentException('14 jours maximum.');
    }
    return ['start' => $start, 'end' => $end, 'rolling' => false];
}

function range_windows(DateTimeImmutable $start, DateTimeImmutable $end): array
{
    $out = [];
    $cursor = $start;
    while ($cursor <= $end && count($out) < 16) {
        $candidate = $cursor->modify('+23 hours +59 minutes +59 seconds');
        $next = $candidate < $end ? $candidate : $end;
        $out[] = ['start' => utc_iso($cursor), 'end' => utc_iso($next)];
        $cursor = $next->modify('+1 second');
    }
    return $out;
}

function add_pair($left, $right): array
{
    $left = is_array($left) ? $left : [0, 0];
    $right = is_array($right) ? $right : [0, 0];
    return [(float)($left[0] ?? 0) + (float)($right[0] ?? 0), (float)($left[1] ?? 0) + (float)($right[1] ?? 0)];
}

function merge_breakdown(array &$target, $source): void
{
    if (!is_array($source)) {
        return;
    }
    foreach ($source as $key => $row) {
        if (!is_array($row)) {
            continue;
        }
        $current = $target[$key] ?? ['wl' => [0, 0], 'weightedWL' => [0, 0]];
        $target[$key] = [
            'wl' => add_pair($current['wl'] ?? null, $row['wl'] ?? null),
            'weightedWL' => add_pair($current['weightedWL'] ?? null, $row['weightedWL'] ?? null),
        ];
    }
}

function merge_stats(array $rows): ?array
{
    if (count($rows) <= 1) {
        return $rows[0] ?? null;
    }
    $stats = [
        'games' => 0,
        'wins' => 0,
        'losses' => 0,
        'weightedWins' => 0,
        'weightedLosses' => 0,
        'playerSessions' => 0,
        'softBalance' => $rows[count($rows) - 1]['softBalance'] ?? null,
        'hardBalance' => $rows[count($rows) - 1]['hardBalance'] ?? null,
        'teamTypeWL' => [],
        'teamCountWL' => [],
    ];
    foreach ($rows as $row) {
        $stats['games'] += (int)($row['games'] ?? 0);
        $stats['wins'] += (int)($row['wins'] ?? 0);
        $stats['losses'] += (int)($row['losses'] ?? 0);
        $stats['weightedWins'] += (float)($row['weightedWins'] ?? 0);
        $stats['weightedLosses'] += (float)($row['weightedLosses'] ?? 0);
        $stats['playerSessions'] += (int)($row['playerSessions'] ?? 0);
        merge_breakdown($stats['teamTypeWL'], $row['teamTypeWL'] ?? null);
        merge_breakdown($stats['teamCountWL'], $row['teamCountWL'] ?? null);
    }
    $stats['weightedWLRatio'] = $stats['weightedLosses'] > 0 ? $stats['weightedWins'] / $stats['weightedLosses'] : $stats['weightedWins'];
    return $stats;
}

function merge_sessions(array $lists): array
{
    $seen = [];
    $results = [];
    foreach ($lists as $list) {
        foreach ($list['results'] ?? [] as $row) {
            $id = (string)($row['gameId'] ?? '');
            if ($id === '' || isset($seen[$id])) {
                continue;
            }
            $seen[$id] = true;
            $results[] = $row;
        }
    }
    usort($results, static function ($a, $b) {
        return strcmp((string)($b['gameStart'] ?? ''), (string)($a['gameStart'] ?? ''));
    });
    return ['total' => count($results), 'results' => $results];
}

function load_clan(array $range): array
{
    $windows = range_windows($range['start'], $range['end']);
    $board = api_json('/public/clans/leaderboard');
    $members = all_pages('/public/clan/' . CLAN . '/members', []);
    $slices = [];
    foreach ($windows as $window) {
        $query = ['start' => $window['start'], 'end' => $window['end']];
        $stats = api_json('/public/clan/' . CLAN . '?' . http_build_query($query));
        $sessions = all_pages('/public/clan/' . CLAN . '/sessions', $query);
        $slices[] = ['stats' => $stats['clan'] ?? [], 'sessions' => $sessions];
    }
    $clans = $board['clans'] ?? [];
    $index = -1;
    foreach ($clans as $i => $clan) {
        if (($clan['clanTag'] ?? '') === CLAN) {
            $index = $i;
            break;
        }
    }
    return [
        'tag' => CLAN,
        'fetchedAt' => gmdate('c'),
        'day' => [
            'start' => utc_iso($range['start']),
            'end' => utc_iso($range['end']),
            'rolling' => !empty($range['rolling']),
        ],
        'season' => [
            'start' => $board['start'] ?? null,
            'end' => $board['end'] ?? null,
            'rank' => $index >= 0 ? $index + 1 : null,
            'listed' => count($clans),
            'entry' => $index >= 0 ? $clans[$index] : null,
        ],
        'leaderboard' => $clans,
        'stats' => merge_stats(array_map(static function ($slice) {
            return $slice['stats'];
        }, $slices)),
        'members' => $members,
        'sessions' => merge_sessions(array_map(static function ($slice) {
            return $slice['sessions'];
        }, $slices)),
        'roster' => sum_roster($members['results'] ?? []),
    ];
}

$cache = '';
$snap = cache_dir() . '/snap-clan.json';
$range = [];
try {
    set_time_limit(120);
    $range = resolve_range((string)($_GET['from'] ?? ''), (string)($_GET['to'] ?? ''), ($_GET['now'] ?? '') === '1');
    $key = !empty($range['rolling'])
        ? '24h'
        : substr(hash('sha256', utc_iso($range['start']) . '|' . utc_iso($range['end'])), 0, 24);
    $cache = cache_dir() . '/clan-' . $key . '.json';
    $fresh = isset($_GET['fresh']);
    $snap = cache_dir() . '/snap-clan.json';
    if (!empty($range['rolling']) && is_file($snap) && !$fresh) {
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        header('X-Robots-Tag: noindex, nofollow, noarchive, nosnippet');
        header('X-Snap-Age: ' . max(0, time() - filemtime($snap)));
        readfile($snap);
        exit;
    }
    if (!$fresh && is_file($cache) && time() - filemtime($cache) < 3600) {
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        header('X-Robots-Tag: noindex, nofollow, noarchive, nosnippet');
        readfile($cache);
        exit;
    }
    $payload = json_encode(load_clan($range), JSON_UNESCAPED_UNICODE);
    atomic_write($cache, $payload);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Robots-Tag: noindex, nofollow, noarchive, nosnippet');
    echo $payload;
} catch (InvalidArgumentException $error) {
    json_out(['error' => $error->getMessage()], 400);
} catch (Throwable $error) {
    if (!empty($range['rolling']) && is_file($snap)) {
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        header('X-Robots-Tag: noindex, nofollow, noarchive, nosnippet');
        readfile($snap);
        exit;
    }
    if (is_file($cache)) {
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        header('X-Robots-Tag: noindex, nofollow, noarchive, nosnippet');
        readfile($cache);
        exit;
    }
    json_out(['error' => 'Clan indisponible'], 502);
}
