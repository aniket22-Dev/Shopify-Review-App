// app/routes/api/typedReviews.ts

import { json } from "@remix-run/node";
import type { LoaderFunction } from "@remix-run/node";
import db from "../db.server"; // Adjust the path as necessary

// GET Request to fetch typed reviews
export const loader: LoaderFunction = async ({ request }) => {
    const url = new URL(request.url);
    const productId = url.searchParams.get("productId");
    const shop = url.searchParams.get("shop");
    const clientId = url.searchParams.get("client");

    // Validate required query parameters
    if (!productId || !shop) {
        const errorResponse: any = {
            ok: false,
            message: "Missing query parameters: productId and shop are required",
        };
        return json(errorResponse, { status: 400 });
    }

    try {
        // Build the 'where' clause conditionally based on the presence of clientId
        const whereClause: any = {
            productId,
            shop,
        };

        if (clientId) {
            whereClause.clientId = clientId;
        }

        // Fetch typed reviews from the typedReview model
        const typedReviews = await db.typedReview.findMany({
            where: whereClause,
            orderBy: {
                createdAt: "desc", // Optional: Order reviews by creation date
            },
            select: {
                id: true,
                productId: true,
                shop: true,
                createdAt: true,
                ratingDescription: true,
                loggedIn: true,
                clientId: true,
            },
        });

        const successResponse: any = {
            ok: true,
            reviews: typedReviews.map((review: any) => ({
                ...review,
                createdAt: review.createdAt.toISOString(), // Convert Date to ISO string
            })),
        };

        return json(successResponse, {
            status: 200,
            headers: {
                "Access-Control-Allow-Origin": "*", // Adjust as needed for security
                "Access-Control-Allow-Methods": "GET,OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
            },
        });
    } catch (error) {
        console.error("Error fetching typed reviews:", error);
        const errorResponse: any = {
            ok: false,
            message: "An error occurred while fetching the typed reviews.",
        };
        return json(errorResponse, { status: 500 });
    }
};

export const action: any = async ({ request }) => {
    // Ensure the request is JSON
    const contentType = request.headers.get("Content-Type");
    if (!contentType || !contentType.includes("application/json")) {
        return json<any>(
            {
                ok: false,
                message: "Invalid Content-Type. Expected application/json.",
            },
            { status: 400 }
        );
    }

    try {
        const data: any = await request.json();

        // Validate required fields
        const { productId, shop, ratingDescription, loggedIn, clientId } = data;
        if (!productId || !shop || !ratingDescription || !loggedIn || !clientId) {
            return json<any>(
                {
                    ok: false,
                    message:
                        "Missing fields: productId, shop, ratingDescription, and loggedIn are required.",
                },
                { status: 400 }
            );
        }

        // Optional: Further validation (e.g., string lengths, formats)

        // Create a new typedReview entry
        const newReview = await db.typedReview.create({
            data: {
                productId,
                shop,
                ratingDescription,
                loggedIn,
                clientId
            },
            select: {
                id: true,
                productId: true,
                shop: true,
                createdAt: true,
                ratingDescription: true,
                loggedIn: true,
                clientId: true
            },
        });

        return json<any>(
            {
                ok: true,
                review: {
                    ...newReview,
                    createdAt: newReview.createdAt.toISOString(),
                },
            },
            { status: 201 }
        );
    } catch (error) {
        console.error("Error creating typed review:", error);
        return json<any>(
            {
                ok: false,
                message: "An error occurred while creating the typed review.",
            },
            { status: 500 }
        );
    }
};
