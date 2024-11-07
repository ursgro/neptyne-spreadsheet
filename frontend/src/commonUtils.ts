import range from "lodash/range";
import clone from "lodash/clone";

export const joinArrayBy = <T extends any, I extends any>(
  array: T[],
  insertion: I,
  partition: number = 1
): (T | I)[] => {
  const output: (T | I)[] = clone(array);
  for (const [index, rangeIndex] of range(partition, array.length, partition).entries())
    output.splice(index + rangeIndex, 0, insertion);

  return output;
};
export const splitIntoGroups = <T extends any>(
  array: T[],
  groupSize: number = 2
): T[][] => {
  const output: T[][] = [];
  const source: T[] = clone(array);
  while (source.length) output.push(source.splice(0, groupSize));

  return output;
};
