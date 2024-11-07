# What's New in Neptyne

## July 1, 2024

### Features
- A new UI to set environment variables
- Send an email when a @nt.daily or @nt.weekly trigger fails
- Better AI-generated snippets
- An improved AI prompt UI in the REPL

### Bug Fixes
- Fix image-based plots in Streamlit
- Fix for using insert/append APIs with numpy/pandas

## June 24, 2024

### Features
- New "Getting Started" popup
- Better compatibility with date types
- API Proxying with Google Gemini
- A [context manager](https://docs.neptyne.com/kernel/neptyne_api/sheet.html#NeptyneSheetCollection.use_sheet) to make it more convenient to point your code at other sheets
- Upgraded streamlit to 1.36
  - this includes support for multi-page apps

### Bug Fixes
- Fixes an issue where negative indexes on cell ranges might resolve outside the range
- Fixes a reconnection bug in Streamlit where a disconnected websocket might fail to reconnect

## June 15, 2024

### Features
- [A new API for programmatically setting a cells formula](https://docs.neptyne.com/kernel/neptyne_api.html#Formula)

### Bug Fixes
- Dates are now properly handled when set from Python
