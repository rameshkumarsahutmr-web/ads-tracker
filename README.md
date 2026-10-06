<div align="center">

# 🚀 Ollyflix Autonomous AI Live Ad Tracker & Stream Sniffer

![Version](https://img.shields.io/badge/version-8.0-blue.svg?style=for-the-badge)
![NodeJS](https://img.shields.io/badge/Node.js-v16+-success.svg?style=for-the-badge&logo=nodedotjs)
![Puppeteer](https://img.shields.io/badge/Puppeteer-Ready-orange.svg?style=for-the-badge&logo=puppeteer)

*The ultimate tool for real-time web dashboarding, ad blocking, stream sniffing, and intelligent web automation!*

</div>

---

## ✨ Features

- 🖥️ **Real-Time Web Dashboard**: Built-in HLS player with SSE Event Streaming.
- 🤖 **Puppeteer-Stealth Anti-Bot Evasion**: Bypasses Cloudflare & Turnstile seamlessly.
- 💥 **Smart Overlay Buster**: Automatically removes clickjackers & simulates real play.
- 🐒 **Runtime JS Monkey-Patching**: Intercepts `window.open`, `fetch()`, and `XHR`.
- 📊 **Categorized Ad Intelligence**: Detects betting, adult content, popunders, telemetry, and VAST ads.
- 🕵️‍♂️ **Stream Headers Sniffer**: Generates ready-to-use ExoPlayer, VLC, and FFmpeg configurations.
- ⚛️ **Next.js/React SPA Smart Extractor**: Works effortlessly with modern SPAs like ZXC-Prime and Vidsrc.
- 🎛️ **Dual Mode Operation**: Use the Web GUI on `http://localhost:3300` OR the Command-Line (CLI).

---

## 🚀 Getting Started

### Prerequisites

Ensure you have the following installed on your machine:
- [Node.js](https://nodejs.org/) (v16 or higher)
- npm (Node Package Manager)

### Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/rameshkumarsahutmr-web/ads-tracker.git
   cd ads-tracker
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

### 🎯 Usage

To run the tracker in dual mode (CLI or Web Dashboard), execute the batch file:

```bash
RUN_TRACKER.bat
```

Alternatively, you can run the JavaScript file directly:

```bash
node live_tracker.js
```

Once running, access the real-time Web GUI at:
👉 **[http://localhost:3300](http://localhost:3300)**

---

## 🛠️ Configuration

- **Cache File**: Known ad lists are cached in `ad_blocklist_cache.txt` (ignored in Git).
- **Reports**: Scan data is automatically saved to `LATEST_SCAN_REPORT.txt` and `LATEST_SCAN_DATA.json`.

---

<div align="center">
  <i>Maintained with ❤️ by Ramesh CSC Center</i>
</div>
