import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase Admin Client
// We need the SERVICE_ROLE_KEY to bypass RLS policies if necessary, 
// or ensure the user has update permissions.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

// Robust key selection: Prefer Service Role, fallback to Anon key
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; 

if (!supabaseUrl || !supabaseKey) {
  console.error("Server Error: Missing Supabase URL or Key in environment variables.");
  // We don't throw here to avoid crashing the module load, but subsequent calls will fail gracefully.
}

const supabase = createClient(supabaseUrl || "", supabaseKey || "");

export async function POST(request) {
  try {
    // Fail fast if config is missing
    if (!supabaseUrl || !supabaseKey) {
        return NextResponse.json({ error: "Server Configuration Error: Missing Supabase credentials." }, { status: 500 });
    }

    const body = await request.json();
    const { orderNumbers } = body; // Expect an array of DO Numbers

    console.log("Sync request received for:", orderNumbers);

    if (!orderNumbers || !Array.isArray(orderNumbers) || orderNumbers.length === 0) {
      return NextResponse.json({ error: "No order numbers provided" }, { status: 400 });
    }

    // Shipday API Key
    // Ideally this should be in process.env.SHIPDAY_API_KEY
    const apiKey = "rcYWeuw04H.hZp9ci8IDz8XDjA0URsP"; 
    
    const foundDrivers = [];
    const errors = [];

    // Loop through orders and fetch status from Shipday
    // We iterate because Shipday's standard endpoint is by order number
    for (const doNum of orderNumbers) {
        try {
            // Shipday Get Order Details
            // URL: https://api.shipday.com/orders/{ordernumber}
            const shipdayUrl = `https://api.shipday.com/orders/${doNum}`;
            
            const response = await fetch(shipdayUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `Basic ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                // Shipday returns an array of order details objects
                const data = await response.json();
                
                if (Array.isArray(data) && data.length > 0) {
                    const orderData = data[0]; // Take the first match
                    
                    // Check if a carrier is assigned
                    const driver = orderData.assignedCarrier ? orderData.assignedCarrier.name : null;
                    
                    if (driver) {
                        console.log(`Found driver ${driver} for order ${doNum}`);
                        foundDrivers.push({ doNumber: doNum, driverName: driver });
                        
                        // Attempt Server-Side Update as backup (might fail RLS)
                        await supabase
                            .from('Orders')
                            .update({ DriverName: driver })
                            .eq('DONumber', doNum);
                    } else {
                        console.log(`No driver assigned yet for ${doNum} in Shipday`);
                    }
                } else {
                    console.warn(`Order ${doNum} not found in Shipday response`);
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