## 0.1.0

- New setting `vscode_darkmode.mode` (`time` | `gnome`).
- `gnome` mode follows `org.gnome.desktop.interface` (`color-scheme`, fallback `gtk-theme`) using `gsettings monitor`, no polling.
- Time mode now checks every 30 s instead of every second.
- Changes to `vscode_darkmode.*` settings are applied without reloading.
- Added "VSCODE DARKMODE" output channel for debugging.

---

## 0.0.9

- Fixed performance

- Minor Optimizations

- Added 2 new command

| command        | function              |
| -------------- | --------------------- |
| stop darkmode  | Stop changing themes  |
| start darkmode | Start changing themes |

---

## 0.0.8

- Fixed links.
- Deleted unnessecary commands.

---

## 0.0.2

added 1 new configuration for time

```json
{
  "vscode_darkmode.day": number, // start of day time
  "vscode_darkmode.night": number // start of night time
}
```

- Fixed starting without commnand issues.
- Added Gif for more detailed instruction.
