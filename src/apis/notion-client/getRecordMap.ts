import { ExtendedRecordMap } from "notion-types"
import { notionApi, queuedNotionId } from "./index"
import fs from "fs"
import path from "path"

const CACHE_DIR = path.join(process.cwd(), ".next/cache", "notion-pages")

export const getRecordMap = async (pageId: string) => {
  const cachePath = path.join(CACHE_DIR, `${pageId}.json`)

  // 1. 파일 캐시 확인
  if (fs.existsSync(cachePath)) {
    try {
      const stats = fs.statSync(cachePath)
      // 상세 페이지 캐시 유효 시간: 1시간
      const isOld = Date.now() - stats.mtimeMs > 1000 * 60 * 60
      if (!isOld) {
        const cacheData = fs.readFileSync(cachePath, "utf-8")
        console.log(`getRecordMap: Loading ${pageId} from file cache...`)
        return JSON.parse(cacheData) as ExtendedRecordMap
      }
    } catch (e) {
      console.warn(`getRecordMap: Cache read error for ${pageId}, fetching from Notion...`)
    }
  }

  try {
    console.log(`getRecordMap: Fetching ${pageId} from Notion...`)
    const recordMap = await queuedNotionId(() => notionApi.getPage(pageId))

    // 2. 파일 캐시 저장
    try {
      if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true })
      }
      fs.writeFileSync(cachePath, JSON.stringify(recordMap), "utf-8")
    } catch (e) {
      console.warn(`getRecordMap: Failed to write cache file for ${pageId}`)
    }

    return recordMap
  } catch (error: any) {
    console.error(`getRecordMap: Error for ${pageId}:`, error.message)
    throw error
  }
}
