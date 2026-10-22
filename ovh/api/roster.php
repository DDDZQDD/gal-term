<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
require_login();

$id = (string)($_GET['id'] ?? '');
if (!preg_match('/^[A-Za-z0-9]{4,16}$/', $id)) {
    json_out(['error' => 'Partie invalide'], 400);
}

$dir = cache_dir() . '/games';
if (!is_dir($dir)) {
    mkdir($dir, 0755, true);
}
$cache = $dir . '/' . $id . '.json';
if (is_file($cache)) {
    $cached = json_decode((string)file_get_contents($cache), true);
    if (is_array($cached) && array_key_exists('map', $cached)) {
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        echo json_encode($cached, JSON_UNESCAPED_UNICODE);
        exit;
    }
}

try {
    $data = api_json('/public/game/' . rawurlencode($id) . '?turns=false');
    $players = [];
    foreach (($data['info']['players'] ?? []) as $player) {
        if (!is_array($player) || empty($player['username'])) {
            continue;
        }
        $players[] = [
            'name' => $player['username'],
            'clan' => $player['clanTag'] ?? null,
            'publicId' => $player['publicID'] ?? null,
        ];
    }
    $payload = json_encode([
        'players' => $players,
        'map' => $data['info']['config']['gameMap'] ?? null,
    ], JSON_UNESCAPED_UNICODE);
    file_put_contents($cache, $payload);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo $payload;
} catch (Throwable $error) {
    json_out(['players' => []], 200);
}
