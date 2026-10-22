<?php
declare(strict_types=1);
require __DIR__ . '/api/bootstrap.php';
start_gate();

$error = '';
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    if (locked_out()) {
        $error = 'Trop d’essais. Réessaie dans quelques minutes.';
    } elseif (admin_password_ok((string)($_POST['password'] ?? ''))) {
        session_regenerate_id(true);
        $_SESSION['admin'] = 1;
        clear_fail();
        header('Location: ./admin.php');
        exit;
    } else {
        note_fail();
        $error = 'Code refusé.';
    }
}

if (!admin_logged_in()) {
    header('Content-Type: text/html; charset=utf-8');
    header('X-Robots-Tag: noindex, nofollow, noarchive, nosnippet');
    header('Cache-Control: no-store');
    $message = $error !== '' ? '<p class="bad">' . htmlspecialchars($error, ENT_QUOTES, 'UTF-8') . '</p>' : '';
    echo <<<HTML
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow, noarchive, nosnippet">
  <title>Admin GAL</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #09090b; color: #f4f4f5; font: 16px/1.4 system-ui, sans-serif; }
    form { width: min(360px, calc(100% - 32px)); background: #12141a; border: 1px solid #27272a; border-radius: 16px; padding: 24px; display: grid; gap: 12px; }
    h1 { margin: 0; color: #fbbf24; letter-spacing: 0.08em; }
    p { margin: 0; color: #a1a1aa; }
    .bad { color: #fb7185; }
    input { background: #09090b; color: #f4f4f5; border: 1px solid #3f3f46; border-radius: 10px; padding: 12px; font: inherit; }
    button { background: #fbbf24; color: #09090b; border: 0; border-radius: 10px; padding: 12px; font: inherit; font-weight: 700; cursor: pointer; }
  </style>
</head>
<body>
  <form method="post" action="./admin.php">
    <h1>ADMIN</h1>
    <p>Liste admin — tag GAL en solo dans une partie équipes.</p>
    {$message}
    <input type="password" name="password" autocomplete="current-password" autofocus required>
    <button type="submit">Entrer</button>
  </form>
</body>
</html>
HTML;
    exit;
}

header('Content-Type: text/html; charset=utf-8');
header('X-Robots-Tag: noindex, nofollow, noarchive, nosnippet');
header('Cache-Control: no-store');
readfile(__DIR__ . '/admin.html');
