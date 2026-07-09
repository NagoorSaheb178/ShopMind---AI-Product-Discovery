# ShopMind - AI Product Discovery 🚀

A modern React-based product recommendation system powered by real-time AI (Groq API). ShopMind allows users to search for products using natural language and receive instantly tailored product recommendations with explanations, just like talking to a store expert.

## Features ✨

- **Live AI Search as You Type:** Type what you're looking for (e.g., *"budget phone with a great camera"* or *"headphones for travelling"*). The app automatically debounces your input and streams AI results without needing to click search.
- **Intelligent Explanations:** When you search, the AI acts as your guide. It briefly explains what the product or category is, why you might need it, and introduces its top picks.
- **Product Reasoning:** Every recommended product comes with a specific, one-sentence explanation from the AI detailing exactly why it matches your unique needs.
- **Real-Time Streaming Response:** Powered by the **Groq API (Llama 3.3)** and Server-Sent Events (SSE). Results stream in token-by-token so the UI feels incredibly fast and responsive. 
- **Premium UI/UX:** A clean, modern "cream/warm" aesthetic with skeleton loaders, smooth animations, dynamic grids, and a responsive "Flipkart-style" 3-column layout on mobile devices.
- **Local Static Assets:** Fully configured with real, high-quality product images ensuring lightning-fast load times and zero hotlinking issues.

## Tech Stack 🛠️

- **Frontend:** React, Vite (v5)
- **Styling:** Vanilla CSS Modules (for scoped, maintainable styles)
- **AI Integration:** Groq API `llama-3.3-70b-versatile` model
- **Data Flow:** Fetch API with `ReadableStream` for chunk-by-chunk SSE parsing

## Setup Instructions 💻

### 1. Install Dependencies
Make sure you are running Node v22 or compatible. In the project directory, run:
```bash
npm install
```

### 2. Configure API Key
Create a `.env` file in the root directory of the project and add your Groq API key:
```env
VITE_GROQ_API_KEY=your_groq_api_key_here
```

### 3. Start the Development Server
```bash
npm run dev
```
Navigate to `http://localhost:5173` in your browser.

## Project Structure 📁
- `src/App.jsx`: The main application shell and state manager. Handles the debounced search and dynamically toggles between "AI Mode" and "Browse Mode".
- `src/components/`: Modular React components.
  - `SearchBar.jsx`: Handles user input, debounce triggers, and the animated loading state.
  - `AIResultsPanel.jsx`: Displays the streaming explanation text from the AI.
  - `ProductCard.jsx`: Beautiful product display with skeleton loading states and AI reasoning tags.
- `src/services/groqService.js`: The engine of the app. Handles the POST request to Groq, reads the SSE stream, manages rate limits, and safely parses the JSON chunks.
- `src/data/products.js`: The catalog containing 25 products with rich metadata and real image URLs.

## Implementation Details 🧠

To meet strict UI/UX criteria while ensuring the API is not overwhelmed:
- **Debouncing:** Input is debounced by `1500ms` so Groq is only queried when you pause typing.
- **Abort Controller:** If a new query is fired while an old one is still streaming, the old stream is instantly canceled to save bandwidth and prevent UI race conditions.
- **Resilient Parsing:** The SSE parser is designed to handle JSON objects that span across multiple byte chunks, ensuring the live extraction of product IDs never breaks the UI mid-stream.
