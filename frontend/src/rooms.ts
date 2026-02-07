import type { ExtraService } from "./services";

export type RoomDef = {
  id: string;
  name: string;
  extras: ExtraService[];
};

/**
 * Категории как в таблице заказчика.
 * extras заданы так, чтобы соответствовать схеме из Excel (по столбцам 1..5).
 */
export const ROOMS: RoomDef[] = [
  {
    id: "s1",
    name: "Номера с каменкой",
    // 1
    extras: ["kamenka", "sauna", "pool", "steam"],
  },
  {
    id: "s2",
    name: "Номера с сауной и паром, бассейном и купелью",
    // 2
    extras: ["sauna", "pool", "steam"],
  },
  {
    id: "s3",
    name: "Номера с сауной и паром, и купелью",
    // 3
    extras: ["sauna", "steam"],
  },
  {
    id: "s4",
    name: "Номера «Сауна»",
    // 4
    extras: ["sauna", "pool"],
  },
  {
    id: "s5",
    name: "Номер «Элит»",
    // 5
    extras: ["sauna", "pool", "steam"],
  },
];
