import type { JsonValue } from "@/lib/mapping-engine";

export interface MappingSample {
  id: string;
  description: string;
  json: JsonValue;
  title: string;
}

export const mappingSamples: MappingSample[] = [
  {
    id: "donuts",
    title: "Donut Catalog",
    description:
      "A bakery menu with nested batters and toppings. Great for seeing how the tool handles layered data.",
    json: {
      items: {
        item: [
          {
            id: "0001",
            type: "donut",
            name: "Cake",
            ppu: 0.55,
            organic: true,
            createdAt: "2026-03-01T12:00:00.000Z",
            batters: {
              batter: [
                { id: "1001", type: "Regular" },
                { id: "1002", type: "Chocolate" },
                { id: "1003", type: "Blueberry" },
                { id: "1004", type: "Devil's Food" },
              ],
            },
            topping: [
              { id: "5001", type: "None" },
              { id: "5002", type: "Glazed" },
              { id: "5005", type: "Sugar" },
              { id: "5007", type: "Powdered Sugar" },
              { id: "5006", type: "Chocolate with Sprinkles" },
              { id: "5003", type: "Chocolate" },
              { id: "5004", type: "Maple" },
            ],
          },
          {
            id: "0002",
            type: "donut",
            name: "Raised",
            ppu: 0.55,
            organic: false,
            createdAt: "2026-03-05T08:15:00.000Z",
            batters: {
              batter: [{ id: "1001", type: "Regular" }],
            },
            topping: [
              { id: "5001", type: "None" },
              { id: "5002", type: "Glazed" },
              { id: "5005", type: "Sugar" },
            ],
          },
        ],
      },
    },
  },
  {
    id: "heterogeneous",
    title: "Mixed-Shape Records",
    description:
      "Rows with different fields. Useful for seeing how missing values and mixed data types are handled.",
    json: {
      records: [
        { id: "a1", price: 10, label: "starter", active: true },
        { id: "a2", price: "N/A", notes: { source: "manual" }, active: false },
        { id: "a3", label: "pro", tags: ["fast", "stable"] },
      ],
    },
  },
  {
    id: "collisions",
    title: "Duplicate Column Names",
    description:
      "Data where different levels produce the same column name, showing how name conflicts are resolved.",
    json: {
      rows: [{ user_id: 1, user: { id: 2 }, meta: { user: { id: 3 } } }],
    },
  },
];
