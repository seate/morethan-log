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
  if (fs.existsSync(CACHE_PATH)) {
    try {
      const stats = fs.statSync(CACHE_PATH)
      if (Date.now() - stats.mtimeMs < 1000 * 60 * 5) {
        return JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8")) as TPosts
      }
    } catch (e) {}
  }

  try {
    const originalId = CONFIG.notionConfig.pageId as string
    
    console.log("getPosts: Fetching database structure...")
    const mainDbResponse = await queuedNotionId(() => notionApi.getPage(originalId))

    if (!mainDbResponse.collection || Object.keys(mainDbResponse.collection).length === 0) {
      console.error("getPosts: ERROR: No collection found")
      return []
    }

    const collectionId = Object.keys(mainDbResponse.collection)[0]
    const collectionRecord = mainDbResponse.collection[collectionId]
    const collectionValue = collectionRecord?.value
    
    // 검증된 스키마 추출 로직
    const schema = collectionValue?.schema || (collectionRecord as any)?.schema || (collectionValue as any)?.value?.schema

    if (!schema) {
      console.error("getPosts: ERROR: Schema not found. Structure:", JSON.stringify(collectionRecord).substring(0, 200))
      return []
    }

    const pageIds = getAllPageIds(mainDbResponse)
    if (pageIds.length === 0) return []

    console.log(`getPosts: Fetching ${pageIds.length} posts in batch...`)
    const { recordMap: postsRecordMap } = await queuedNotionId(() => 
      (notionApi as any).getBlocks(pageIds)
    )
    
    const data = []
    const blocks = postsRecordMap.block

    for (const postId of pageIds) {
      const postBlockValue = blocks[postId]?.value
      if (!postBlockValue) continue

      try {
        // getPageProperties는 block 맵 전체를 받아서 처리합니다.
        const properties = await getPageProperties(postId, blocks, schema)
        if (!properties) continue

        properties.createdTime = new Date(postBlockValue.created_time).toString()
        properties.fullWidth = (postBlockValue.format as any)?.page_full_width ?? false
        data.push(properties)
      } catch (e) {
        console.warn(`getPosts: Failed to parse ${postId}`)
      }
    }

    data.sort((a: any, b: any) => {
      const dateA: any = new Date(a?.date?.start_date || a.createdTime)
      const dateB: any = new Date(b?.date?.start_date || b.createdTime)
      return dateB - dateA
    })

    try {
      if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true })
      fs.writeFileSync(CACHE_PATH, JSON.stringify(data), "utf-8")
    } catch (e) {}

    console.log(`getPosts: Done. Loaded ${data.length} posts.`)
    return data as TPosts
  } catch (error) {
    console.error("getPosts: critical error", error)
    return []
  }
}
