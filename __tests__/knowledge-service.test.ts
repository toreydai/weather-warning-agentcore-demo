import { describe, expect, it } from "vitest"
import { buildKbS3Key, sanitizeKbFilename, validateKbUpload } from "@/lib/services/knowledge"

describe("knowledge service pure helpers", () => {
  it("sanitizes unsafe filenames", () => {
    expect(sanitizeKbFilename("../马铃薯 指南?.md")).toBe("马铃薯_指南_.md")
  })

  it("accepts supported document extensions", () => {
    expect(validateKbUpload("guide.md", 10)).toBe("guide.md")
    expect(validateKbUpload("notes.txt", 10)).toBe("notes.txt")
    expect(validateKbUpload("report.pdf", 10)).toBe("report.pdf")
  })

  it("rejects unsupported extensions and oversize files", () => {
    expect(() => validateKbUpload("bad.exe", 10)).toThrow(/仅支持/)
    expect(() => validateKbUpload("empty.md", 0)).toThrow(/不能为空/)
    expect(() => validateKbUpload("huge.pdf", 11 * 1024 * 1024)).toThrow(/10MB/)
  })

  it("builds upload keys under the uploads prefix", () => {
    const key = buildKbS3Key("guide.md")
    expect(key).toMatch(/^uploads\/\d{4}-\d{2}-\d{2}\/\d+-guide\.md$/)
  })
})

