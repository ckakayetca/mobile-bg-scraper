# Mobile.bg Car Scraper

A Node.js scraper that finds first-owner cars on mobile.bg by going through all pages of search results.

## Features

- **Pagination Support**: Automatically navigates through all pages of search results
- **First-Owner Detection**: Filters cars based on Bulgarian keywords ("първи", "първият", "първия", "история") found in ad descriptions
- **Description-Based Filtering**: Checks the `div class="info"` (ad description) for first-owner keywords instead of just titles
- **Import Filtering**: Automatically skips listings containing "нов внос" (new import) in descriptions
- **Seller Filtering**: Skips listings with `div class="seller"` (dealer listings)
- **TOP/VIP Ad Filtering**: Skips promoted listings with `class="item TOP"` or `class="item VIP"`
- **Custom DOM Parser**: No external dependencies for DOM manipulation
- **Configurable Limits**: Set maximum pages to scrape and request delays
- **Duplicate Removal**: Automatically removes duplicate car listings
- **Results Export**: Saves found car links to timestamped text files

## Installation

1. Install dependencies:
```bash
npm install
```

2. Run the scraper:
```bash
npm start
```

## How it works

1. Starts from the specified URL: `https://www.mobile.bg/obiavi/avtomobili-dzhipove/ot-2010/oblast-sofiya?price=12000&price1=13000`
2. Fetches each page and parses the HTML using regex (no external DOM libraries)
3. Extracts car listing links that contain "obiava-" pattern
4. For each car listing, finds the main container (`div class="item"`)
5. Extracts the description text from `div class="info"` within each listing
6. Skips cars that contain "нов внос" (new import) in their description
7. Filters cars that contain first-owner keywords in their description text
8. Skips cars that have a "seller" div (commercial sellers)
9. Skips TOP and VIP ads (promoted listings)
10. Continues to the next page until the page limit is reached or no more pages are found
11. Removes duplicate car listings
12. Saves all unique car links to a timestamped text file

## Output

The scraper will create a file named `first-owner-cars-[timestamp].txt` containing all the found car links, one per line.

## Configuration

You can modify the following constants at the top of `scraper.js`:
- `MAX_PAGES_TO_SCRAPE`: Maximum number of pages to scrape (set to 0 for unlimited)
- `REQUEST_DELAY_MS`: Delay between requests in milliseconds
- `startUrl`: The initial URL to start scraping from
- `firstOwnerKeywords`: Keywords to look for in car descriptions

### Example Configuration:
```javascript
const MAX_PAGES_TO_SCRAPE = 5; // Scrape only 5 pages
const REQUEST_DELAY_MS = 2000; // 2 second delay between requests
```
