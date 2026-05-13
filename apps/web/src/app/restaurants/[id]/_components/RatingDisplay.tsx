import { Chip } from "@heroui/react";
import { formatFamilyAverage } from "@forkd/shared";

interface Props {
  average: number | null;
  count: number;
}

export function RatingDisplay({ average, count }: Props) {
  const { display, ariaLabel } = formatFamilyAverage(average, count);
  return (
    <Chip variant="flat" color="default" aria-label={ariaLabel}>
      {display}
    </Chip>
  );
}
