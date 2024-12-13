// app/routes/index.tsx

import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  LegacyCard,
  DataTable,
  Spinner,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { json } from "@remix-run/node";
import moment from "moment";
import React, { useEffect, useState } from 'react';

// --------------------
// TypeScript Interfaces
// --------------------

// Represents a product fetched from Shopify
interface Product {
  id: string;
  title: string;
  description: string;
  updatedAt: string;
}

// Represents a single review
interface Review {
  createdAt: string;
  loggedIn: string;
  ratingDescription: string;
}

// Represents the structure of the average rating response
interface RatingData {
  data: {
    avg_rating: number;
  };
}

// Represents the structure of the reviews response
interface ReviewData {
  reviews: Review[];
}

// Represents the data returned by the loader
interface LoaderData {
  products: Product[];
  customerId: string;
}

// --------------------
// Loader Function
// --------------------

// Fetches products from Shopify and retrieves the customerId from the authenticated session
export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    // Authenticate and retrieve admin and customer information
    const { admin, customer } = await authenticate.admin(request); // Assumes `authenticate.admin` returns both `admin` and `customer`

    // Extract customerId from the authenticated customer
    const customerId = customer?.id || ""; // Adjust based on your authentication logic

    // GraphQL query to fetch products
    const response = await admin.graphql(`
      {
        products(first: 25, sortKey: UPDATED_AT, reverse: true, query: "published_status:published") {
          nodes {
            id
            title
            description
            updatedAt
          }
        }
      }
    `);

    // Parse the JSON response
    const {
      data: {
        products: { nodes },
      },
    } = await response.json();

    // Return the products and customerId as JSON
    return json({ products: nodes as Product[], customerId } as LoaderData);
  } catch (error) {
    console.error("Error fetching products:", error);
    // Return an empty products array and empty customerId on error
    return json({ products: [] as Product[], customerId: "" } as LoaderData);
  }
};

// --------------------
// Utility Functions
// --------------------

// Fetches the average rating for a given product and shop
const fetchAverageRating = async (productId: string, shop: string): Promise<number> => {
  try {
    // Extract the numeric part of the product ID (e.g., from "gid://shopify/Product/1234567890" to "1234567890")
    const productIdNumeric = productId.split('/').pop();

    // Fetch the average rating from the API
    const response = await fetch(`http://localhost:41051/api/rating?productId=${productIdNumeric}&shop=${shop}`); // Use localhost URL here

    if (!response.ok) {
      throw new Error(`Failed to fetch average rating for product ID: ${productIdNumeric}`);
    }

    const data: RatingData = await response.json();

    // Return the average rating or 0 if not available
    return data.data?.avg_rating || 0;
  } catch (error) {
    console.error("Error fetching average rating:", error);
    return 0; // Default to 0 on error
  }
};

// Fetches typed reviews for a given product, shop, and optionally customerId
const fetchTypedReview = async (productId: string, shop: string, customerId?: string): Promise<Review[]> => {
  try {
    // Extract the numeric part of the product ID
    const productIdNumeric = productId.split('/').pop();

    // Build query parameters
    const params = new URLSearchParams({
      productId: productIdNumeric || "",
      shop,
    });

    // Append 'client' parameter if customerId is provided
    if (customerId) {
      params.append("client", customerId);
    }

    // Fetch the reviews from the API
    const response = await fetch(`http://localhost:41051/api/review?${params.toString()}`); // Use localhost URL here

    if (!response.ok) {
      throw new Error(`Failed to fetch reviews for product ID: ${productIdNumeric}`);
    }

    const data: ReviewData = await response.json();

    // Return the reviews array or an empty array if not available
    return Array.isArray(data.reviews) ? data.reviews : [];
  } catch (error) {
    console.error("Error fetching typed reviews:", error);
    return []; // Return empty array on error
  }
};

// --------------------
// Main Component
// --------------------

export default function Index() {
  // Load data from the loader
  const { products, customerId } = useLoaderData<LoaderData>();

  // State to hold the rows for the DataTable
  const [rows, setRows] = useState<Array<any>>([]);

  // Track the length of array
  const [hasReviews, setHasReviews] = useState<boolean>(true);

  // State to manage loading state
  const [loading, setLoading] = useState<boolean>(true);

  // Async function to fetch ratings and reviews for each product
  const fetchRatingsForProducts = async () => {
    try {
      // Use Promise.all to fetch data for all products concurrently
      const fetchedRows = await Promise.all(
        products.map(async (product) => {
          // Fetch the average rating for the product
          const averageRating = await fetchAverageRating(product.id, "aniket-review-app.myshopify.com"); // Replace with your actual shop name

          // Fetch all typed reviews for the product (filtered by customerId if provided)
          const typedReviews = await fetchTypedReview(product.id, "aniket-review-app.myshopify.com"); // Replace with your actual shop name

          // If there are no reviews, skip this product
          if (typedReviews.length === 0) {
            return []; // Will filter out later
          }

          // Map each review to a separate row in the DataTable
          return typedReviews.map((review) => [
            product.title, // Product Name
            averageRating.toFixed(1), // Average Rating
            moment(review.createdAt).fromNow(), // Review Updated Time
            review.loggedIn, // Customer Email
            review.ratingDescription, // Written Review
          ]);
        })
      );

      // Flatten the array of arrays into a single array of rows
      const flattenedRows = fetchedRows.flat();

      // Update the length of flatten array
      setHasReviews(flattenedRows.length > 0);

      // Update the state with the fetched rows 
      setRows(flattenedRows);
    } catch (error) {
      console.error("Error fetching ratings and reviews:", error);
    } finally {
      setLoading(false); // Set loading to false regardless of success or failure
    }
  };

  // Fetch ratings and reviews once the component is mounted or when products/customerId change
  useEffect(() => {
    fetchRatingsForProducts();
  }, [products, customerId]);

  return (
    <Page title="Review App">
      <LegacyCard>
        {loading ? (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              padding: "20px",
            }}
          >
            <Spinner accessibilityLabel="Loading reviews" size="large" />
          </div>
        ) : hasReviews ? (
          <DataTable
            columnContentTypes={[
              "text",
              "numeric",
              "text",
              "text",
              "text",
            ]}
            headings={[
              "Product Name",
              "Average Rating",
              "Review Updated Time",
              "Customer Email",
              "Written Review",
            ]}
            rows={rows}
          />
        ) : (
          <div
            style={{
              textAlign: "center",
              padding: "20px",
            }}
          >
            <h2>No Reviews Found</h2>
          </div>
        )}
      </LegacyCard>
    </Page>
  );
}
