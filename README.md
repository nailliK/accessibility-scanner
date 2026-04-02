# Accessibility Scanner

A CLI tool that spiders through your domain and reports accessibility issues on each page using [Playwright](https://playwright.dev/) and [axe-core](https://github.com/dequelabs/axe-core).

## Setup

1. Install dependencies: `npm install`
2. Install Playwright's Chromium browser: `npx playwright install chromium`

## Usage

1. Run `npm start`
2. When prompted, enter the full URL for the website you'd like to scan
3. View your scan results in `output/scan-results.html`
