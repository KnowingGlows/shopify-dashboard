# Shopify Multi-Store Sales Dashboard

A beautiful, dark-themed dashboard that combines sales data from multiple Shopify stores into one intuitive interface. Built with Next.js, TypeScript, and Tailwind CSS.

## Features

- 📊 **Combined Analytics**: View total sales, orders, and average order value across all stores
- 🏪 **Multi-Store Support**: Add unlimited Shopify stores
- 🔍 **Store Filtering**: Filter data to view individual store performance
- 💰 **INR Currency**: All data displayed in Indian Rupees
- 🌙 **Dark Theme**: Aesthetic dark-themed UI with smooth animations
- 📈 **Store Breakdown**: Visual breakdown showing each store's contribution
- ⚡ **Real-time Updates**: Refresh data on demand

## Prerequisites

Before you begin, you need:
1. Node.js 18+ installed
2. Admin API access tokens for each Shopify store you want to track

## Getting Your Shopify API Credentials

For each store you want to track:

1. Log in to your Shopify admin panel
2. Go to **Settings** → **Apps and sales channels** → **Develop apps**
3. Click **Create an app** (or select an existing one)
4. Give it a name like "Sales Dashboard"
5. Go to **Configuration** → **Admin API integration**
6. Under **Admin API access scopes**, select:
   - `read_orders`
   - `read_products` (optional)
7. Click **Save**
8. Go to **API credentials** tab
9. Click **Install app** if not already installed
10. Copy the **Admin API access token** (starts with `shpat_`)
11. Your store domain is in format: `your-store-name.myshopify.com`

## Installation

1. Navigate to the project directory:
```bash
cd shopify-dashboard
```

2. Install dependencies (already done):
```bash
npm install
```

3. Create your environment file:
```bash
cp ../.env.example .env.local
```

4. Edit `.env.local` and add your Shopify store credentials:
```env
# Format: SHOPIFY_STORE_X=store-domain.myshopify.com|admin_api_token

SHOPIFY_STORE_1=store1.myshopify.com|shpat_xxxxxxxxxxxxxxxxxxxxx
SHOPIFY_STORE_2=store2.myshopify.com|shpat_xxxxxxxxxxxxxxxxxxxxx
SHOPIFY_STORE_3=store3.myshopify.com|shpat_xxxxxxxxxxxxxxxxxxxxx
```

**Important**:
- Replace `store1.myshopify.com` with your actual store domain
- Replace `shpat_xxxxxxxxxxxxxxxxxxxxx` with your actual Admin API access token
- Use the pipe character `|` to separate domain and token
- Add as many stores as needed by incrementing the number (SHOPIFY_STORE_1, SHOPIFY_STORE_2, etc.)

## Running the Application

1. Start the development server:
```bash
npm run dev
```

2. Open your browser and navigate to:
```
http://localhost:3000
```

3. The dashboard will automatically fetch and display data from all configured stores!

## Usage

### Viewing All Stores
By default, the dashboard shows combined data from all your stores:
- **Total Sales (INR)**: Combined revenue across all stores
- **Total Orders**: Total number of orders from all stores
- **Average Order Value**: Mean order value across all orders
- **Store Breakdown**: Visual chart showing each store's performance

### Filtering by Store
Use the store filter dropdown in the top-right corner to:
- Select "All Stores" for combined view
- Select a specific store name to view only that store's data

### Refreshing Data
Click the refresh button (↻) in the top-right corner to fetch the latest data from Shopify.

## Project Structure

```
shopify-dashboard/
├── app/
│   ├── api/sales/         # API route for fetching Shopify data
│   ├── globals.css        # Global styles with dark theme
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Main page
├── components/
│   ├── ui/                # shadcn/ui components
│   ├── dashboard.tsx      # Main dashboard component
│   ├── stats-card.tsx     # Metric card component
│   ├── store-breakdown.tsx # Store comparison chart
│   └── store-filter.tsx   # Store filter dropdown
├── lib/
│   ├── shopify-api.ts     # Shopify API integration
│   ├── shopify-config.ts  # Store configuration
│   ├── sales-aggregator.ts # Data aggregation logic
│   └── currency-converter.ts # Currency formatting
└── types/
    └── shopify.ts         # TypeScript type definitions
```

## Building for Production

1. Build the application:
```bash
npm run build
```

2. Start the production server:
```bash
npm start
```

## Troubleshooting

### "No Shopify stores configured" error
- Make sure `.env.local` exists in the project root
- Check that your environment variables are formatted correctly
- Restart the dev server after adding/modifying `.env.local`

### "Failed to fetch orders" error
- Verify your Admin API access token is correct
- Ensure your app has `read_orders` scope enabled
- Check that your store domain is correct (should end with `.myshopify.com`)

### Data not showing
- Check browser console for errors
- Verify your stores have orders
- Try refreshing the page or clicking the refresh button

## Tech Stack

- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui
- **Icons**: Lucide React
- **API**: Shopify Admin REST API

## Future Enhancements

Potential features for future versions:
- Date range filtering
- Export data to CSV/Excel
- Sales trends and charts over time
- Product performance analytics
- Customer insights
- Email reports

## License

MIT

---

Built with ❤️ using Next.js and Shopify API
