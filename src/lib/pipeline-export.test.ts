import { createMappingConfig } from "@/lib/mapping-engine";
import type { ColumnProfile } from "@/lib/column-profiling";
import {
  buildPipelineConfig,
  generateJqSnippet,
  generatePandasSnippet,
  generateSqlSnippet,
  parsePipelineConfig,
  serializePipelineConfig,
} from "@/lib/pipeline-export";

describe("pipeline-export", () => {
  const config = createMappingConfig({
    flattenMode: "parallel",
    rootPath: "$.records[*]",
  });

  it("serializes and parses a pipeline config round-trip", () => {
    const pipeline = buildPipelineConfig({
      columnOrder: ["id", "email"],
      headerAliases: { email: "Email Address" },
      mappingConfig: config,
      rootPath: "$.records[*]",
      sampleId: "donuts",
      sourceMode: "sample",
    });

    expect(pipeline.version).toBe(1);
    expect(pipeline.rootPath).toBe("$.records[*]");
    expect(pipeline.source.sampleId).toBe("donuts");

    const serialized = serializePipelineConfig(pipeline);
    const parsed = parsePipelineConfig(serialized);

    expect("error" in parsed).toBe(false);
    if (!("error" in parsed)) {
      expect(parsed.version).toBe(1);
      expect(parsed.rootPath).toBe("$.records[*]");
      expect(parsed.headerAliases).toEqual({ email: "Email Address" });
      expect(parsed.columnOrder).toEqual(["id", "email"]);
    }
  });

  it("returns error for invalid JSON", () => {
    const result = parsePipelineConfig("{broken");
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toMatch(/invalid json/i);
    }
  });

  it("returns error for wrong version", () => {
    const result = parsePipelineConfig(JSON.stringify({ version: 99 }));
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toMatch(/unsupported config version/i);
    }
  });

  it("generates a valid pandas snippet", () => {
    const pipeline = buildPipelineConfig({
      columnOrder: ["id", "email"],
      headerAliases: { email: "Email Address" },
      mappingConfig: config,
      rootPath: "$.records[*]",
      sourceMode: "custom",
    });

    const snippet = generatePandasSnippet(pipeline);

    expect(snippet).toContain("import pandas as pd");
    expect(snippet).toContain('record_path=["records"]');
    expect(snippet).toContain('df = df.rename(columns=');
    expect(snippet).toContain('df = df[["id","email"]]');
    expect(snippet).toContain("to_csv");
  });

  it("generates snippet without record_path for root $", () => {
    const pipeline = buildPipelineConfig({
      columnOrder: [],
      headerAliases: {},
      mappingConfig: config,
      rootPath: "$",
      sourceMode: "custom",
    });

    const snippet = generatePandasSnippet(pipeline);

    expect(snippet).toContain("pd.json_normalize(data)");
    expect(snippet).not.toContain("record_path");
  });

  it("omits sampleId for custom source mode", () => {
    const pipeline = buildPipelineConfig({
      columnOrder: [],
      headerAliases: {},
      mappingConfig: config,
      rootPath: "$",
      sourceMode: "custom",
    });

    expect(pipeline.source.sampleId).toBeUndefined();
  });

  describe("generateJqSnippet", () => {
    it("generates basic jq snippet with record path", () => {
      const pipeline = buildPipelineConfig({
        columnOrder: [],
        headerAliases: {},
        mappingConfig: config,
        rootPath: "$.records[*]",
        sourceMode: "custom",
      });

      const snippet = generateJqSnippet(pipeline);
      expect(snippet).toContain(".records[]");
      expect(snippet).toContain("@csv");
    });

    it("generates jq snippet for root $", () => {
      const pipeline = buildPipelineConfig({
        columnOrder: [],
        headerAliases: {},
        mappingConfig: config,
        rootPath: "$",
        sourceMode: "custom",
      });

      const snippet = generateJqSnippet(pipeline);
      expect(snippet).toContain(".[]");
    });

    it("generates jq snippet with renames", () => {
      const pipeline = buildPipelineConfig({
        columnOrder: ["id", "email"],
        headerAliases: { email: "Email Address" },
        mappingConfig: config,
        rootPath: "$.records[*]",
        sourceMode: "custom",
      });

      const snippet = generateJqSnippet(pipeline);
      expect(snippet).toContain('"Email Address": .email');
      expect(snippet).toContain("@csv");
    });

    it("generates jq snippet with column order only", () => {
      const pipeline = buildPipelineConfig({
        columnOrder: ["id", "name"],
        headerAliases: {},
        mappingConfig: config,
        rootPath: "$.records[*]",
        sourceMode: "custom",
      });

      const snippet = generateJqSnippet(pipeline);
      expect(snippet).toContain(".id");
      expect(snippet).toContain(".name");
      expect(snippet).toContain("@csv");
    });
  });

  describe("generateSqlSnippet", () => {
    const makeProfile = (header: string, kind: string | null, emptyPercent: number): ColumnProfile => ({
      cardinalityRatio: 1,
      dominantKind: kind,
      emptyCount: 0,
      emptyPercent,
      header,
      histogram: null,
      nullPattern: "none",
      numeric: null,
      sourcePath: header,
      stringLength: null,
      topValues: [],
      totalRows: 10,
      uniqueCount: 10,
    });

    it("generates CREATE TABLE with correct types", () => {
      const pipeline = buildPipelineConfig({
        columnOrder: ["id", "name", "score", "active"],
        headerAliases: {},
        mappingConfig: config,
        rootPath: "$",
        sourceMode: "custom",
      });

      const profiles: ColumnProfile[] = [
        makeProfile("id", "number", 0),
        makeProfile("name", "string", 0),
        makeProfile("score", "number", 10),
        makeProfile("active", "boolean", 0),
      ];

      const snippet = generateSqlSnippet(pipeline, profiles);
      expect(snippet).toContain("CREATE TABLE imported_data");
      expect(snippet).toContain("id NUMERIC NOT NULL");
      expect(snippet).toContain("name TEXT NOT NULL");
      expect(snippet).toContain("score NUMERIC");
      expect(snippet).not.toContain("score NUMERIC NOT NULL");
      expect(snippet).toContain("active BOOLEAN NOT NULL");
      expect(snippet).toContain("\\COPY");
      expect(snippet).toContain("HEADER true");
    });

    it("uses aliased names in SQL", () => {
      const pipeline = buildPipelineConfig({
        columnOrder: ["email"],
        headerAliases: { email: "Email Address" },
        mappingConfig: config,
        rootPath: "$",
        sourceMode: "custom",
      });

      const profiles: ColumnProfile[] = [makeProfile("email", "string", 0)];

      const snippet = generateSqlSnippet(pipeline, profiles);
      expect(snippet).toContain("email_address TEXT");
    });

    it("marks nullable columns correctly", () => {
      const pipeline = buildPipelineConfig({
        columnOrder: ["a", "b"],
        headerAliases: {},
        mappingConfig: config,
        rootPath: "$",
        sourceMode: "custom",
      });

      const profiles: ColumnProfile[] = [
        makeProfile("a", "string", 0),
        makeProfile("b", "string", 50),
      ];

      const snippet = generateSqlSnippet(pipeline, profiles);
      expect(snippet).toContain("a TEXT NOT NULL");
      expect(snippet).toMatch(/b TEXT[^N]/);
    });
  });
});
