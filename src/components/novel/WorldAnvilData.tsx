import { prisma } from "@/lib/prisma";
import { WorldAnvilSidebar } from "./WorldAnvilSidebar";

type WorldAnvilDataProps = {
  novelId: string;
};

export async function WorldAnvilData({ novelId }: WorldAnvilDataProps) {
  const worldAnvilData = await prisma.novel.findUnique({
    where: { id: novelId },
    include: {
      roles: true,
      scenes: true,
      clues: true,
    },
  });

  if (!worldAnvilData) {
    return null;
  }

  return (
    <WorldAnvilSidebar
      roles={worldAnvilData.roles}
      scenes={worldAnvilData.scenes}
      clues={worldAnvilData.clues}
    />
  );
}
