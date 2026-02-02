import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const body = await request.json();
    const { order } = body; 

    // Debugging: Log what we received
    console.log("Shipday API Route received order:", order ? "Yes" : "No");

    // 1. Validate Payload Structure
    if (!order || !order.info || !order.items) {
      console.error("Invalid payload structure. Received:", JSON.stringify(body).substring(0, 200));
      return NextResponse.json({ error: "Invalid order data structure. Expected { info, items }" }, { status: 400 });
    }

    // 2. Map Data to Shipday Format
    // Access properties via 'order.info'
    const payload = {
      orderNumber: order.info.DONumber,
      customerName: order.info["Customer Name"],
      customerAddress: order.info["Delivery Address"],
      // Shipday requires a phone number. Use a dummy if missing to prevent 400 error.
      customerPhoneNumber: order.info["Contact Number"] || "+60123456789", 
      restaurantName: "Fresher Farm Direct",
      restaurantAddress: "Lot 18 & 19, Kompleks Selayang, 68100 Batu Caves",
      expectedDeliveryDate: order.info["Delivery Date"],
      // Map items array
      orderItem: order.items.map(item => ({
        name: item["Order Items"],
        quantity: parseInt(item.Quantity) || 1,
        unitPrice: parseFloat(item.Price) || 0,
        detail: `UOM: ${item.UOM} ${item.SpecialNotes ? '| ' + item.SpecialNotes : ''}`
      }))
    };

    // 3. Check API Key
    const apiKey = process.env.rcYWeuw04H.hZp9ci8IDz8XDjA0URsP;
    if (!apiKey) {
        console.error("Server Error: SHIPDAY_API_KEY is not set in .env.local");
        return NextResponse.json({ error: "Server Configuration Error: Missing API Key" }, { status: 500 });
    }

    // 4. Send to Shipday
    const response = await fetch('https://api.shipday.com/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Shipday API Error Response:", data);
      return NextResponse.json({ error: data }, { status: response.status });
    }

    return NextResponse.json(data);

  } catch (error) {
    console.error("Shipday Route Exception:", error);
    return NextResponse.json({ error: "Internal Server Error: " + error.message }, { status: 500 });
  }
}