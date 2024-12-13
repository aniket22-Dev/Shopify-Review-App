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
  id: number;
  productId: string;
  shop: string;
  createdAt: string;
  rating?: number; // Optional since it's not present in typedReviews
  clientId: string;
  ratingDescription: string;
  loggedIn: string;
}

// Represents the structure of the average rating response
interface RatingData {
  ok: boolean;
  data: {
    avg_rating: number;
    reviews: Review[];
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

// Define a specific type for DataTable rows
type DataTableRow = [
  string, // Product Name
  number, // Average Rating
  number, // Rating By Customer
  string, // Review Updated Time
  string, // Customer Email
  string  // Written Review
];

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
const fetchAverageRating = async (
  productId: string,
  shop: string,
  customerId?: string
): Promise<RatingData | null> => {
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

    // Fetch the average rating from the API
    const response = await fetch(`http://localhost:39555/api/rating?${params.toString()}`); // Use localhost URL here

    if (!response.ok) {
      throw new Error(`Failed to fetch average rating for product ID: ${productIdNumeric}`);
    }

    const data: RatingData = await response.json();

    // Return the average rating or null if not available
    return data.ok ? data : null;
  } catch (error) {
    console.error("Error fetching average rating:", error);
    return null; // Return null on error
  }
};

// Fetches typed reviews for a given product, shop, and optionally customerId
const fetchTypedReview = async (
  productId: string,
  shop: string,
  customerId?: string
): Promise<Review[]> => {
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
    const response = await fetch(`http://localhost:39555/api/review?${params.toString()}`); // Use localhost URL here

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
  const [rows, setRows] = useState<DataTableRow[]>([]);

  // State to manage loading state
  const [loading, setLoading] = useState<boolean>(true);

  // Async function to fetch ratings and reviews for each product
  const fetchRatingsForProducts = async () => {
    try {
      const fetchedRows = await Promise.all(
        products.map(async (product) => {
          // Fetch the average rating for the product
          const averageRating = await fetchAverageRating(
            product.id,
            "aniket-review-app.myshopify.com",
            customerId
          );

          // Fetch all typed reviews for the product
          const typedReviews = await fetchTypedReview(
            product.id,
            "aniket-review-app.myshopify.com",
            customerId
          );

          // Check if there are any typed reviews
          const hasReviews = typedReviews.length > 0;

          if (!hasReviews || !averageRating) {
            // If there are no typed reviews or averageRating is null, exclude this product
            return []; // No rows for this product
          }

          // Extract and format the average rating
          const avgRating = averageRating.data.avg_rating.toFixed(1);

          // Map each typedReview to a row
          return typedReviews.map((typedReview) => {
            // Find the corresponding review in averageRating.data.reviews
            const matchingReview = averageRating.data.reviews.find(
              (review) => review.id === typedReview.id || review.clientId === typedReview.clientId
            );

            // Extract the rating; default to 0 if not found
            const rating = matchingReview?.rating ?? 0;

            return [
              product.title, // Product Name
              avgRating, // Average Rating
              rating, // Rating By Customer
              moment(typedReview.createdAt).fromNow(), // Review Updated Time
              typedReview.loggedIn, // Customer Email
              typedReview.ratingDescription ?? 'N/A', // Written Review
            ] as unknown as DataTableRow;
          });
        })
      );

      console.log('fetchedRows', fetchedRows);

      // Flatten the array of arrays into a single array of rows
      const flattenedRows = fetchedRows.flat();

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
          // Display a spinner while loading
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              padding: "20px",
            }}
          >
            <Spinner accessibilityLabel="Loading reviews" size="large" />
          </div>
        ) : rows.length === 0 ? (
          // Display a message when no reviews are available
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              padding: "20px",
            }}
          >
            <p>No reviews available for the products.</p>
          </div>
        ) : (
          // Display the DataTable once loading is complete and data is available
          <DataTable
            columnContentTypes={[
              "text",    // Product Name
              "numeric", // Average Rating
              "numeric", // Rating By Customer
              "text",    // Review Updated Time
              "text",    // Customer Email
              "text",    // Written Review
            ]}
            headings={[
              "Product Name",
              "Average Rating",
              "Rating By Customer",
              "Review Updated Time",
              "Customer Email",
              "Written Review",
            ]}
            rows={rows}
          // Optional: Add additional props like `stickyHeader` or `footerContent`
          // stickyHeader
          />
        )}
      </LegacyCard>
    </Page>
  );
}
