<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

const SNAPS = ['clan', 'week', 'quarter', 'players', 'ranks'];

$name = (string)($_GET['name'] ?? '');
if (!in_array($name, SNAPS, true)) {
    json_out(['error' => 'nom'], 400);
}
$path = cache_dir() . '/snap-' . $name . '.json';

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    $given = (string)($_SERVER['HTTP_X_LIVE_KEY'] ?? '');
    $expected = (string)(cfg()['live_key'] ?? '');
    if ($expected === '' || !hash_equals($expected, $given)) {
        json_out(['error' => 'auth'], 401);
    }
    $raw = file_get_contents('php://input');
    if ($raw === false || strlen($raw) > 12000000) {
        json_out(['error' => 'trop gros'], 413);
    }
    if (!is_array(json_decode($raw, true))) {
        json_out(['error' => 'json'], 400);
    }
    if (!atomic_write($path, $raw)) {
        json_out(['error' => 'écriture'], 500);
    }
    json_out(['ok' => true]);
}

require_login();
if ($name === 'players' || !is_file($path)) {
    json_out(['error' => 'Pas encore reçu'], 503);
}
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow, noarchive, nosnippet');
readfile($path);
