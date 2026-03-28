import { CONFIG } from "site.config"
import { idToUuid } from "notion-utils"
import { notionApi, queuedNotionId } from "./index"
import fs from "fs"
import path from "path"

import getAllPageIds from "src/libs/utils/notion/getAllPageIds"
import getPageProperties from "src/libs/utils/notion/getPageProperties"
import { TPosts } from "src/types"

const CACHE_DIR = path.join(process.cwd(), ".next/cache")
const CACHE_PATH = path.join(CACHE_DIR, "notion-posts.json")

export const getPosts = async () => {
  // 1. 파일 캐시 확인 (개발 모드에서 효율적)
  if (fs.existsSync(CACHE_PATH)) {
    try {
      const stats = fs.statSync(CACHE_PATH)
      // 캐시 유효 시간: 10분
      const isOld = Date.now() - stats.mtimeMs > 1000 * 60 * 10
      if (!isOld) {
        const cacheData = fs.readFileSync(CACHE_PATH, "utf-8")
        console.log("getPosts: Loading from file cache...")
        return JSON.parse(cacheData) as TPosts
      }
    } catch (e) {
      console.warn("getPosts: Cache read error, fetching from Notion...")
    }
  }

  try {
    const originalId = CONFIG.notionConfig.pageId as string
    
    console.log("getPosts: Fetching from Notion (this may take a while)...")
    const mainDbResponse = await queuedNotionId(() => notionApi.getPage(originalId))

    if (!mainDbResponse.collection || Object.keys(mainDbResponse.collection).length === 0) {
      console.error("getPosts: ERROR: No collection found")
      return []
    }

    const collectionId = Object.keys(mainDbResponse.collection)[0]
    const collectionRecord = mainDbResponse.collection[collectionId]
    const collection = collectionRecord?.value
    const schema = collection?.schema || (collectionRecord as any)?.schema || (collection as any)?.value?.schema

    if (!schema) {
      console.error("getPosts: ERROR: Schema not found")
      return []
    }

    const pageIds = getAllPageIds(mainDbResponse)
    const data = []

    for (let i = 0; i < pageIds.length; i++) {
      const postId = pageIds[i]
      try {
        const postResponse = await queuedNotionId(() => notionApi.getPage(postId))
        const postBlock = postResponse.block

        if (!postBlock[postId]?.value) continue

        const properties = (await getPageProperties(postId, postBlock, schema)) || null
        properties.createdTime = new Date(postBlock[postId].value?.created_time).toString()
        properties.fullWidth = (postBlock[postId].value?.format as any)?.page_full_width ?? false

        data.push(properties)
        console.log(`getPosts: [${i + 1}/${pageIds.length}] fetched: ${properties.title}`)
      } catch (error: any) {
        console.error(`getPosts: Error for ${postId}:`, error.message)
        if (error.message.includes("429")) {
          console.warn("getPosts: Rate limited. Stopping and saving partial cache.")
          break
        }
      }
    }

    data.sort((a: any, b: any) => {
      const dateA: any = new Date(a?.date?.start_date || a.createdTime)
      const dateB: any = new Date(b?.date?.start_date || b.createdTime)
      return dateB - dateA
    })

    // 2. 파일 캐시 저장
    try {
      if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true })
      }
      fs.writeFileSync(CACHE_PATH, JSON.stringify(data), "utf-8")
      console.log("getPosts: Cache saved to file.")
    } catch (e) {
      console.warn("getPosts: Failed to write cache file")
    }

    return data as TPosts
  } catch (error) {
    console.error("getPosts: critical error", error)
    return []
  }
}
