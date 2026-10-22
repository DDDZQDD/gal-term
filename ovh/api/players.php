<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

require_login();
$path = cache_dir() . '/snap-players.json';
$data = is_file($path) ? json_decode((string)file_get_contents($path), true) : null;
if (!is_array($data) || !isset($data['rows']) || !is_array($data['rows'])) {
    json_out(['error' => 'Annuaire pas encore reçu'], 503);
}

function wl_ratio($pair): float
{
    $games = (int)($pair[0] ?? 0) + (int)($pair[1] ?? 0);
    return $games ? (int)$pair[0] / $games : 0.0;
}

function clan_tag(array $row): string
{
    return (string)($row['clan']['tag'] ?? '');
}

$sorts = [
    'name' => static fn(array $row) => mb_strtolower((string)($row['name'] ?? '')),
    'clan' => static fn(array $row) => mb_strtolower(clan_tag($row) !== '' ? clan_tag($row) : '~'),
    'games' => static fn(array $row) => isset($row['stats']) ? $row['stats']['total'][0] + $row['stats']['total'][1] : -1,
    'wins' => static fn(array $row) => isset($row['stats']) ? $row['stats']['total'][0] : -1,
    'ratio' => static fn(array $row) => isset($row['stats']) ? wl_ratio($row['stats']['total']) : -1,
    'team' => static fn(array $row) => isset($row['stats']) ? $row['stats']['team'][0] : -1,
    'ffa' => static fn(array $row) => isset($row['stats']) ? $row['stats']['ffa'][0] : -1,
    'ranked' => static fn(array $row) => isset($row['stats']) ? $row['stats']['r1v1'][0] + $row['stats']['r2v2'][0] : -1,
    'clanGames' => static fn(array $row) => isset($row['clan']['games']) ? (int)$row['clan']['games'] : -1,
    'clanRatio' => static fn(array $row) => !empty($row['clan']['games']) ? (int)$row['clan']['wins'] / (int)$row['clan']['games'] : -1,
    'last' => static fn(array $row) => (int)($row['last'] ?? 0),
];

$q = mb_strtolower(trim((string)($_GET['q'] ?? '')));
$clan = strtoupper(trim((string)($_GET['clan'] ?? '')));
$sort = isset($sorts[$_GET['sort'] ?? '']) ? (string)$_GET['sort'] : 'wins';
$asc = ($_GET['dir'] ?? '') === 'asc';
$size = min(100, max(10, (int)($_GET['size'] ?? 25)));

$rows = $data['rows'];
if ($q !== '') {
    $rows = array_values(array_filter($rows, static function (array $row) use ($q) {
        return mb_strpos(mb_strtolower(($row['name'] ?? '') . ' ' . ($row['id'] ?? '') . ' ' . clan_tag($row)), $q) !== false;
    }));
}
if ($clan !== '') {
    $rows = array_values(array_filter($rows, static fn(array $row) => strtoupper(clan_tag($row)) === $clan));
}
$key = $sorts[$sort];
usort($rows, static function (array $a, array $b) use ($key, $asc) {
    $order = $key($a) <=> $key($b);
    return ($asc ? $order : -$order) ?: strcasecmp((string)($a['name'] ?? ''), (string)($b['name'] ?? ''));
});

$total = count($rows);
$pages = max(1, (int)ceil($total / $size));
$page = min($pages - 1, max(0, (int)($_GET['page'] ?? 0)));
json_out([
    'total' => $total,
    'page' => $page,
    'pages' => $pages,
    'size' => $size,
    'sort' => $sort,
    'dir' => $asc ? 'asc' : 'desc',
    'rows' => array_slice($rows, $page * $size, $size),
    'status' => $data['status'] ?? null,
]);
