import { Skeleton } from "@/ui/components/Display";

/** H2-L: grey block in place of the map (480 px, W11 pulse). */
export default function HallLoading() {
  return (
    <div className="hall-screen" aria-busy="true">
      <div className="hall-main">
        <Skeleton height={56} />
        <Skeleton height={480} />
      </div>
    </div>
  );
}
