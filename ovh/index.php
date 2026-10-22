<?php
declare(strict_types=1);
require __DIR__ . '/api/bootstrap.php';
start_gate();

$error = '';
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    if (locked_out()) {
        $error = 'Trop d’essais. Réessaie dans quelques minutes.';
    } elseif (proof_ok($_POST)) {
        session_regenerate_id(true);
        $_SESSION['ok'] = 1;
        clear_fail();
        header('Location: ./');
        exit;
    } else {
        note_fail();
        $error = 'Vérification refusée. Réessaie.';
    }
}

if (!logged_in()) {
    header('Content-Type: text/html; charset=utf-8');
    header('X-Robots-Tag: noindex, nofollow, noarchive, nosnippet');
    header('Cache-Control: no-store');
    $message = $error !== '' ? '<p class="bad">' . htmlspecialchars($error, ENT_QUOTES, 'UTF-8') . '</p>' : '<p data-status>Préparation de la vérification…</p>';
    echo <<<HTML
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow, noarchive, nosnippet">
  <title>Clan GAL</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #09090b; color: #f4f4f5; font: 16px/1.4 system-ui, sans-serif; }
    .box { width: min(360px, calc(100% - 32px)); background: #12141a; border: 1px solid #27272a; border-radius: 16px; padding: 24px; display: grid; gap: 12px; }
    h1 { margin: 0; color: #fbbf24; letter-spacing: 0.08em; }
    p { margin: 0; color: #a1a1aa; }
    .bad { color: #fb7185; }
    .hp { position: absolute; left: -9999px; height: 0; overflow: hidden; }
  </style>
</head>
<body data-gate="api/gate.php" data-post="./">
  <div class="box">
    <h1>GAL</h1>
    <p>Page du clan, protégée contre les robots.</p>
    {$message}
    <noscript><p class="bad">Active JavaScript pour entrer.</p></noscript>
  </div>
  <script src="gate.js"></script>
</body>
</html>
HTML;
    exit;
}

header('Content-Type: text/html; charset=utf-8');
header('X-Robots-Tag: noindex, nofollow, noarchive, nosnippet');
header('Cache-Control: no-store');
?>
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow, noarchive, nosnippet" />
    <title>Clan GAL</title>
    <link rel="stylesheet" href="deck.css?v=45124a335f" />
    <link rel="stylesheet" href="skins.css?v=d838ed62fa" />
    <link rel="stylesheet" href="retro.css?v=013b747863" />
  </head>
  <body>
    <div id="app"></div>
    <script src="deck.js?v=26e54953a8"></script>
  </body>
</html>
