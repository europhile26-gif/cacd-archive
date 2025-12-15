-- Extend hearing_type column to handle longer values
-- Background: The gov.uk site occasionally places lengthy additional information
-- into the hearing_type field when the additional_information column is not present.
-- This migration ensures we can capture this data without truncation.

ALTER TABLE hearings 
MODIFY COLUMN hearing_type TEXT;
