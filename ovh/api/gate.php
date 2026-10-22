<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
start_gate();

if (logged_in()) {
    json_out(['ok' => true]);
}

if (locked_out() || too_many_gates()) {
    json_out(['error' => 'lock'], 429);
}

note_gate_issue();
json_out(issue_gate());
