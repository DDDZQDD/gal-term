<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

require_login();
$path = cache_dir() . '/hub.json';
$data = is_file($path) ? json_decode((string)file_get_contents($path), true) : null;
json_out(is_array($data) && isset($data['clans']) ? $data : ['clans' => []]);
