import { Configuration, OpenAIApi } from "openai";
import { NextResponse } from "next/server";

let KEY = "AIzaSyBeaAO6N8fNSlJx5Scuh3fYSPfyn1CKhHg";
let OPENAI_API_KEY = "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";

const configuration = new Configuration({
  apiKey: OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

async function fact_check(query) {
  const response = await fetch(
    `https://factchecktools.googleapis.com/v1alpha1/claims:search?query=${query}&key=${KEY}`,
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
    console.error("No valid claims found in the response.");
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
    "You are a helpful assistant that summarises information from a fact checking website about a claim, your goal is to give a verdict that is based in some ground truth provided to you";
  let user_prompt = `The fact to be checked is ${query}, The information from the fact checker is as follows: ${summary}. You have to do the following, 1. figure out which claim is relevant to your query and then 2. Use these claims then provide verdict and mention how you came on this conclusion`;

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
  console.log("request", request);
  const { claims } = request.body;

  try {
    const verdict = await fact_check(claims);
    return NextResponse.json({ verdict });
  } catch (error) {
    return NextResponse.json({ error: error.toString() });
  }
}
