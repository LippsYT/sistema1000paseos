'use server';

/**
 * @fileOverview AI-powered availability reasoning flow.
 *
 * - availabilityReasoning - A function that determines whether to allow a booking that exceeds capacity.
 * - AvailabilityReasoningInput - The input type for the availabilityReasoning function.
 * - AvailabilityReasoningOutput - The return type for the availabilityReasoning function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const AvailabilityReasoningInputSchema = z.object({
  agencyId: z.string().describe('The ID of the agency making the booking.'),
  requestedQuantity: z.number().describe('The number of bookings requested.'),
  availableCapacity: z.number().describe('The available capacity before the booking.'),
  currentBookings: z.number().describe('The current number of bookings.'),
  historicalOverbookingData: z
    .string()
    .optional()
    .describe('Historical data on overbooking for the agency.'),
  agencyReputation: z.string().optional().describe('The reputation of the agency.'),
});
export type AvailabilityReasoningInput = z.infer<typeof AvailabilityReasoningInputSchema>;

const AvailabilityReasoningOutputSchema = z.object({
  allowBooking: z.boolean().describe('Whether to allow the booking or not.'),
  reason: z.string().describe('The reason for allowing or disallowing the booking.'),
});
export type AvailabilityReasoningOutput = z.infer<typeof AvailabilityReasoningOutputSchema>;

export async function availabilityReasoning(input: AvailabilityReasoningInput): Promise<AvailabilityReasoningOutput> {
  return availabilityReasoningFlow(input);
}

const prompt = ai.definePrompt({
  name: 'availabilityReasoningPrompt',
  input: {schema: AvailabilityReasoningInputSchema},
  output: {schema: AvailabilityReasoningOutputSchema},
  prompt: `You are an AI assistant that helps determine whether a booking should be allowed when it exceeds the available capacity.

  Consider the following factors:
  - Agency ID: {{{agencyId}}}
  - Requested Quantity: {{{requestedQuantity}}}
  - Available Capacity: {{{availableCapacity}}}
  - Current Bookings: {{{currentBookings}}}
  - Historical Overbooking Data: {{{historicalOverbookingData}}}
  - Agency Reputation: {{{agencyReputation}}}

  Based on these factors, decide whether to allow the booking.

  Respond with JSON that has the following fields:
  - allowBooking: true or false
  - reason: A short explanation for your decision.
  `,
});

const availabilityReasoningFlow = ai.defineFlow(
  {
    name: 'availabilityReasoningFlow',
    inputSchema: AvailabilityReasoningInputSchema,
    outputSchema: AvailabilityReasoningOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
