import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// We do NOT initialize Supabase globally here to prevent build-time crashes.
// Instead, we initialize it inside the POST handler.

export async function POST(request) {
  // 1. Initialize Supabase lazily (Runtime only)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("Server Error: Missing Supabase URL or Key.");
    return NextResponse.json({ error: "Server Configuration Error: Missing Supabase credentials." }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // 2. Begin Logic
  try {
    const body = await request.json();
    const { orderNumbers } = body; 

    console.log("Sync request received for:", orderNumbers);

    if (!orderNumbers || !Array.isArray(orderNumbers) || orderNumbers.length === 0) {
      return NextResponse.json({ error: "No order numbers provided" }, { status: 400 });
    }

    // Shipday API Key
    const apiKey = "rcYWeuw04H.hZp9ci8IDz8XDjA0URsP"; 
    
    const foundDrivers = [];

    // Loop through orders
    for (const doNum of orderNumbers) {
        try {
            const shipdayUrl = `https://api.shipday.com/orders/${doNum}`;
            const response = await fetch(shipdayUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `Basic ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                
                if (Array.isArray(data) && data.length > 0) {
                    const orderData = data[0]; 
                    const driver = orderData.assignedCarrier ? orderData.assignedCarrier.name : null;
                    
                    if (driver) {
                        console.log(`Found driver ${driver} for order ${doNum}`);
                        foundDrivers.push({ doNumber: doNum, driverName: driver });
                        
                        // Attempt Server-Side Update (Safe best-effort)
                        await supabase
                            .from('Orders')
                            .update({ DriverName: driver })
                            .eq('DONumber', doNum);
                    }
                }
            } else {
                console.error(`Shipday API error for ${doNum}: ${response.status}`);
            }
        } catch (err) {
            console.error(`Failed to sync ${doNum}`, err);
        }
    }

    return NextResponse.json({ 
        success: true, 
        foundDrivers: foundDrivers 
    });

  } catch (error) {
    console.error("Sync Route Exception:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}