<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
require_admin();

const CLAN = 'GAL';

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

function is_solo_gal_team(array $row): bool
{
    if ((int)($row['clanPlayerCount'] ?? 0) !== 1) {
        return false;
    }
    $mode = $row['playerTeams'] ?? '';
    if ($mode === 'Humans Vs Nations') {
        return false;
    }
    if ($mode === 'Duos' || $mode === 'Trios' || $mode === 'Quads') {
        return true;
    }
    $teams = filter_var($mode, FILTER_VALIDATE_INT);
    return $teams !== false && $teams >= 2;
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
    return $results;
}

function pack_game(array $row, array $detail): array
{
    $gal = null;
    $others = [];
    foreach ($detail['players'] as $player) {
        if (strtoupper((string)($player['clan'] ?? '')) === CLAN && $gal === null) {
            $gal = $player;
        } else {
            $others[] = $player;
        }
    }
    return [
        'gameId' => $row['gameId'] ?? '',
        'start' => $row['gameStart'] ?? null,
        'score' => (float)($row['score'] ?? 0),
        'won' => !empty($row['hasWon']),
        'mode' => $row['playerTeams'] ?? null,
        'teams' => (int)($row['numTeams'] ?? 0),
        'total' => (int)($row['totalPlayerCount'] ?? 0),
        'map' => $detail['map'] ?? '',
        'compact' => !empty($detail['compact']),
        'duration' => $detail['duration'] ?? null,
        'winner' => $detail['winner'] ?? null,
        'gal' => $gal['name'] ?? 'GAL',
        'publicId' => $gal['publicId'] ?? null,
        'verified' => !empty($gal['verified']),
        'others' => $others,
    ];
}

function summarize(array $games): array
{
    $map = [];
    foreach ($games as $game) {
        $key = strtolower((string)($game['publicId'] ?: $game['gal'] ?? ''));
        if ($key === '') {
            continue;
        }
        if (!isset($map[$key])) {
            $map[$key] = [
                'name' => $game['gal'],
                'publicId' => $game['publicId'],
                'verified' => !empty($game['verified']),
                'games' => 0,
                'wins' => 0,
                'losses' => 0,
                'points' => 0.0,
                'last' => $game['start'],
                'lastMap' => $game['map'],
                'lastId' => $game['gameId'],
            ];
        }
        $row = &$map[$key];
        $row['games']++;
        if (!empty($game['won'])) {
            $row['wins']++;
        } else {
            $row['losses']++;
        }
        $row['points'] += (float)$game['score'];
        if (strcmp((string)$game['start'], (string)$row['last']) > 0) {
            $row['last'] = $game['start'];
            $row['lastMap'] = $game['map'];
            $row['lastId'] = $game['gameId'];
            $row['name'] = $game['gal'];
            $row['publicId'] = $game['publicId'] ?: $row['publicId'];
        }
        unset($row);
    }
    $out = array_values($map);
    usort($out, static function ($a, $b) {
        return [$b['games'], abs($b['points'])] <=> [$a['games'], abs($a['points'])];
    });
    return $out;
}

try {
    set_time_limit(120);
    $range = resolve_range((string)($_GET['from'] ?? ''), (string)($_GET['to'] ?? ''), ($_GET['now'] ?? '') === '1');
    $windows = range_windows($range['start'], $range['end']);
    $lists = [];
    foreach ($windows as $window) {
        $lists[] = all_pages('/public/clan/' . CLAN . '/sessions', $window);
    }
    $solo = array_values(array_filter(merge_sessions($lists), 'is_solo_gal_team'));
    $paths = [];
    foreach ($solo as $i => $row) {
        $paths[$i] = '/public/game/' . rawurlencode((string)$row['gameId']) . '?turns=false';
    }
    $rawGames = $paths ? api_many($paths) : [];
    $games = [];
    foreach ($solo as $i => $row) {
        $info = $rawGames[$i]['info'] ?? [];
        $config = $info['config'] ?? [];
        $mods = $config['publicGameModifiers'] ?? [];
        $players = [];
        foreach ($info['players'] ?? [] as $player) {
            if (!is_array($player) || empty($player['username'])) {
                continue;
            }
            $players[] = [
                'name' => $player['username'],
                'clan' => $player['clanTag'] ?? null,
                'publicId' => $player['publicID'] ?? null,
                'verified' => !empty($player['cosmetics']['verified']),
            ];
        }
        $games[] = pack_game($row, [
            'map' => $config['gameMap'] ?? '',
            'compact' => ($config['gameMapSize'] ?? '') === 'Compact' || !empty($mods['isCompact']),
            'duration' => $info['duration'] ?? null,
            'winner' => $info['winner'] ?? null,
            'players' => $players,
        ]);
    }
    json_out([
        'from' => utc_iso($range['start']),
        'to' => utc_iso($range['end']),
        'rolling' => !empty($range['rolling']),
        'total' => count($games),
        'players' => summarize($games),
        'games' => $games,
    ]);
} catch (InvalidArgumentException $error) {
    json_out(['error' => $error->getMessage()], 400);
} catch (Throwable $error) {
    json_out(['error' => 'Liste indisponible'], 502);
}
