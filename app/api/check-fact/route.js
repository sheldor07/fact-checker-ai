import { Configuration, OpenAIApi } from "openai";
import { NextResponse } from "next/server";

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

async function fact_check(query) {
  const response = await fetch(
    `https://factchecktools.googleapis.com/v1alpha1/claims:search?query=${query}&key=${process.env.KEY}`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    }
  );

  if (response.status !== 200) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  console.log("data", response);
  if (data && data.claims && Array.isArray(data.claims)) {
    let preprocessedClaims = data.claims.map(preprocessClaim);
    let verdict = await generateVerdict(query, preprocessedClaims);
    return verdict;
  } else {
    return { verdict: "No valid claims found in the response." };
  }
}

async function generateVerdict(query, preprocessedClaims) {
  // Construct a summary string of all the claims and their fact-checking results.
  let summary = preprocessedClaims
    .map((claim, index) => {
      let reviews = claim.claimReviews
        .map(
          (review) =>
            `Fact-check by ${review.publisher} titled "${review.title}" rated the claim as "${review.rating}". You can read more [here](${review.url}).`
        )
        .join("\n");

      return `Claim ${index + 1}: ${claim.claimText} made by ${
        claim.claimant
      }. \n${reviews}`;
    })
    .join("\n\n");

  // Generate a verdict based on the summary.
  let system_prompt =
    "You are an advanced AI that specializes in summarizing and analyzing information from fact-checking websites about various claims. Your goal is to identify the claims that are directly relevant to a given query, evaluate them objectively, and provide a balanced and fair verdict based on the information provided. Remember to maintain impartiality and rely only on the available facts.";

  let user_prompt = `The fact to be checked is "${query}". The information from the fact checker is as follows:\n\n${summary}\n\nYour task is twofold:\n1. Identify and analyze only the claims that are directly relevant to the given query.\n2. Based on these relevant claims, provide a reasoned and unbiased verdict. Justify your conclusion with clear references to the evidence.`;

  const completion = await openai.createChatCompletion({
    model: "gpt-3.5-turbo",
    messages: [
      { role: "system", content: system_prompt },
      { role: "user", content: user_prompt },
    ],
  });
  return completion.data.choices[0].message.content;
}
// ... (rest of your helper functions here)
function preprocessClaim(claim) {
  return {
    claimText: claim.text,
    claimant: claim.claimant,
    claimDate: claim.claimDate.slice(0, 10), // Extract only the date part of the ISO string.
    claimReviews: claim.claimReview.map((review) => ({
      publisher: review.publisher.name,
      url: review.url,
      title: review.title,
      rating: review.textualRating,
    })),
  };
}
export async function POST(request) {
  const { searchParams } = new URL(request.url);
  const claims = searchParams.get("query");
  try {
    const verdict = await fact_check(claims);
    console.log("verdict", verdict);
    return NextResponse.json({ verdict });
  } catch (error) {
    return NextResponse.json({ error: error.toString() });
  }
}
