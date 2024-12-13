import { json } from "@remix-run/node";
import db from "../db.server";
import { cors } from 'remix-utils/cors';

// Define the expected structure for the incoming JSON data
type ReviewPayload = {
    productId: string;
    shop: string;
    rating: number;
};

// Action for handling POST (submitting a review)
export async function action({ request }: { request: Request }) {
    const contentType = request.headers.get("Content-Type") || "";
    let data: Partial<ReviewPayload> = {};

    // Check if content type is JSON
    if (contentType.includes("application/json")) {
        try {
            data = await request.json();
        } catch (error) {
            return json({
                ok: false,
                message: "Invalid JSON payload.",
            }, { status: 400 });
        }
    } else {
        const formData = await request.formData();
        data = Object.fromEntries(formData) as any;
    }

    const { productId, shop, rating } = data;

    // Validate required fields
    if (!productId || !shop || rating === undefined) {
        return json({
            ok: false,
            message: "Missing data. Required data: productId, shop, rating",
        }, { status: 400 });
    }

    // Validate rating
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return json({
            ok: false,
            message: "Invalid rating. It must be an integer between 1 and 5.",
        }, { status: 400 });
    }

    try {
        // Fetch existing ratings for the product
        const productRatings = await db.review.findMany({
            where: {
                productId: productId,
                shop: shop,
            },
        });

        const totalRatings = productRatings.length;
        const totalScore = productRatings.reduce((acc, review) => acc + review.rating, 0);
        const avgRating = totalRatings > 0 ? (totalScore + rating) / (totalRatings + 1) : rating; // Include new rating in the average

        // Save the new rating in the database
        await db.review.create({
            data: {
                productId,
                shop,
                rating,
            },
        });

        return json({
            ok: true,
            message: "Rating submitted successfully.",
            data: {
                avg_rating: avgRating,
            }
        });
    } catch (error) {
        console.error("Error submitting rating:", error);
        return json({
            ok: false,
            message: "An error occurred while processing the rating.",
        }, { status: 500 });
    }
}

// GET Request to fetch reviews and average rating
export async function loader({ request }: { request: Request }) {
    const url = new URL(request.url);
    const productId = url.searchParams.get("productId");
    const shop = url.searchParams.get("shop");

    if (!productId || !shop) {
        return json({
            ok: false,
            message: "Missing query parameters: productId and shop are required",
        }, { status: 400 });
    }

    try {
        // Fetch all reviews for the product and shop
        const productRatings = await db.review.findMany({
            where: {
                productId: productId,
                shop: shop,
            },
        });

        const totalRatings = productRatings.length;
        const totalScore = productRatings.reduce((acc, review) => acc + review.rating, 0);
        const avgRating = totalRatings > 0 ? totalScore / totalRatings : 0;

        return json({
            ok: true,
            data: {
                reviews: productRatings,
                avg_rating: avgRating,
            }
        });
    } catch (error) {
        console.error("Error fetching reviews:", error);
        return json({
            ok: false,
            message: "An error occurred while fetching the reviews.",
        }, { status: 500 });
    }
}
