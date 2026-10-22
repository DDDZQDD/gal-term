<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
require_login();

$id = (string)($_GET['id'] ?? '');
if (!preg_match('/^[A-Za-z0-9]{4,16}$/', $id)) {
    json_out(['error' => 'Joueur invalide'], 400);
}

$cache = cache_dir() . '/player-' . $id . '.json';
if (is_file($cache) && time() - filemtime($cache) < 3600) {
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    readfile($cache);
    exit;
}

try {
    $data = api_json('/public/player/' . rawurlencode($id));
    $payload = json_encode($data, JSON_UNESCAPED_UNICODE);
    atomic_write($cache, $payload);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo $payload;
} catch (Throwable $error) {
    if (is_file($cache)) {
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        readfile($cache);
        exit;
    }
    json_out(['error' => 'Profil indisponible'], 502);
}
