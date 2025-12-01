export type TrueFalseItem = {
  fact: string;
  fiction: string;
  explanation: string;
};

export const ROUND2_POINTS = 200;

export const pickRandomIndex = (length: number): number => {
  return Math.floor(Math.random() * length);
};
