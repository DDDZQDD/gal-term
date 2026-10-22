<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

$path = cache_dir() . '/live.json';

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    $given = (string)($_SERVER['HTTP_X_LIVE_KEY'] ?? '');
    $expected = (string)(cfg()['live_key'] ?? '');
    if ($expected === '' || !hash_equals($expected, $given)) {
        json_out(['error' => 'auth'], 401);
    }
    $raw = file_get_contents('php://input');
    if ($raw === false || strlen($raw) > 1500000) {
        json_out(['error' => 'trop gros'], 413);
    }
    $data = json_decode($raw, true);
    if (!is_array($data) || ($data['type'] ?? '') !== 'state') {
        json_out(['error' => 'état invalide'], 400);
    }
    if (!atomic_write($path, $raw)) {
        json_out(['error' => 'écriture'], 500);
    }
    json_out(['ok' => true]);
}

require_login();
if (!is_file($path)) {
    json_out(['type' => 'state', 'inGame' => false, 't' => 0]);
}
$raw = (string)file_get_contents($path);
$data = json_decode($raw, true);
if (!is_array($data) || ($data['type'] ?? '') !== 'state') {
    json_out(['type' => 'state', 'inGame' => false, 't' => 0]);
}
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow, noarchive, nosnippet');
echo $raw;
