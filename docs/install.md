# Installation

Download Talkative Lobster for your platform and install it.

## macOS

### Download

| Chip | File |
|------|------|
| Apple Silicon (M1/M2/M3/M4) | `talkative-lobster-arm64.dmg` |
| Intel | `talkative-lobster-x64.dmg` |

Download from the [Download](/download) page or [GitHub Releases](https://github.com/coo-quack/talkative-lobster/releases/latest).

### Install

1. Open the downloaded `.dmg` file
2. Drag **Talkative Lobster** to the **Applications** folder
3. Open the app from Applications

::: warning Unsigned app warning
The app is not signed with an Apple Developer ID. On first launch, macOS will block the app. Go to **System Settings > Privacy & Security** and click **Open Anyway**.
:::

### Permissions

macOS requires explicit permission for:

- **Microphone** — System Settings > Privacy & Security > Microphone
- **Screen Recording** — required for the speaker monitor (filters out system audio). System Settings > Privacy & Security > Screen Recording

## Windows

### Download

| Architecture | File |
|-------------|------|
| x64 | `talkative-lobster-x64-setup.exe` |

Download from the [Download](/download) page or [GitHub Releases](https://github.com/coo-quack/talkative-lobster/releases/latest).

### Install

1. Run the downloaded `.exe` installer
2. Follow the setup wizard
3. Launch Talkative Lobster from the Start menu

### Permissions

- Go to **Settings > Privacy > Microphone** and allow the app

## Linux

### Download

| Format | File |
|--------|------|
| AppImage | `talkative-lobster-x86_64.AppImage` |
| Debian/Ubuntu | `talkative-lobster-amd64.deb` |

Download from the [Download](/download) page or [GitHub Releases](https://github.com/coo-quack/talkative-lobster/releases/latest).

### Install (AppImage)

```bash
chmod +x talkative-lobster-x86_64.AppImage
./talkative-lobster-x86_64.AppImage
```

### Install (deb)

```bash
sudo dpkg -i talkative-lobster-amd64.deb
```

### Permissions

Ensure PulseAudio or PipeWire is running and the app has microphone permissions.

## Next Steps

- [Getting Started](/getting-started) — first launch and initial setup
- [Providers](/providers) — STT and TTS provider configuration
- [Troubleshooting](/troubleshooting) — common issues and solutions
