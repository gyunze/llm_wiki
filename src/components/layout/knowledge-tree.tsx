import { useState, useEffect, useCallback } from "react"
import {
  FileText, Users, Lightbulb, BookOpen, HelpCircle, GitMerge, BarChart3, ChevronRight, ChevronDown, Layout, Globe,
} from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useWikiStore } from "@/stores/wiki-store"
import { readFile, listDirectory } from "@/commands/fs"
import type { FileNode } from "@/types/wiki"
import { normalizePath } from "@/lib/path-utils"

interface WikiPageInfo {
  path: string
  title: string
  type: string
  topic: string
  tags: string[]
  origin?: string
}

// 5 known audit topics — order matters for display
const KNOWN_TOPICS = [
  "关联方关系及其交易的性质",
  "风险评估程序和相关工作",
  "识别和评估重大错报风险",
  "应对评估的重大错报风险",
  "其他相关审计程序",
]

const CATEGORY_CONFIG: Record<string, { icon: typeof FileText; label: string; color: string; order: number }> = {
  "准则":         { icon: BookOpen,     label: "准则",          color: "text-blue-500",    order: 0 },
  "审计方法论":    { icon: GitMerge,     label: "审计方法论",    color: "text-purple-500",  order: 1 },
  "指引性文件":    { icon: Lightbulb,    label: "指引性文件",    color: "text-orange-500",  order: 2 },
  "enablement":   { icon: BarChart3,    label: "Enablement",    color: "text-emerald-500", order: 3 },
  "faq":          { icon: HelpCircle,   label: "FAQ",           color: "text-green-500",   order: 4 },
  overview:       { icon: Layout,       label: "Overview",      color: "text-yellow-500",  order: 5 },
  entity:         { icon: Users,        label: "Entities",      color: "text-blue-400",    order: 6 },
  concept:        { icon: Lightbulb,    label: "Concepts",      color: "text-purple-400",  order: 7 },
  source:         { icon: BookOpen,     label: "Sources",       color: "text-orange-400",  order: 8 },
  synthesis:      { icon: GitMerge,     label: "Synthesis",     color: "text-red-400",     order: 9 },
  comparison:     { icon: BarChart3,    label: "Comparisons",   color: "text-emerald-400", order: 10 },
  query:          { icon: HelpCircle,   label: "Queries",       color: "text-green-400",   order: 11 },
}

const DEFAULT_CONFIG = { icon: FileText, label: "Other", color: "text-muted-foreground", order: 99 }

export function KnowledgeTree() {
  const project = useWikiStore((s) => s.project)
  const selectedFile = useWikiStore((s) => s.selectedFile)
  const setSelectedFile = useWikiStore((s) => s.setSelectedFile)
  const fileTree = useWikiStore((s) => s.fileTree)
  const [pages, setPages] = useState<WikiPageInfo[]>([])
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set(KNOWN_TOPICS.slice(0, 2)))
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set(["overview", "source"]))

  const loadPages = useCallback(async () => {
    if (!project) return
    const pp = normalizePath(project.path)
    try {
      const wikiTree = await listDirectory(`${pp}/wiki`)
      const mdFiles = flattenMdFiles(wikiTree)

      const pageInfos: WikiPageInfo[] = []
      for (const file of mdFiles) {
        if (file.name === "index.md" || file.name === "log.md") continue
        try {
          const content = await readFile(file.path)
          const info = parsePageInfo(file.path, file.name, content)
          pageInfos.push(info)
        } catch {
          pageInfos.push({
            path: file.path,
            title: file.name.replace(".md", "").replace(/-/g, " "),
            type: "other",
            topic: "other",
            tags: [],
          })
        }
      }

      setPages(pageInfos)
    } catch {
      setPages([])
    }
  }, [project])

  useEffect(() => {
    loadPages()
  }, [loadPages, fileTree])

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-sm text-muted-foreground">
        No project open
      </div>
    )
  }

  // Group: topic → category → pages[]
  const topicMap = new Map<string, Map<string, WikiPageInfo[]>>()
  for (const page of pages) {
    const t = topicMap.get(page.topic) ?? new Map()
    const list = t.get(page.type) ?? []
    list.push(page)
    t.set(page.type, list)
    topicMap.set(page.topic, t)
  }

  // Order topics: known topics first (in defined order), then unknown
  const sortedTopics = [...topicMap.keys()].sort((a, b) => {
    const ia = KNOWN_TOPICS.indexOf(a)
    const ib = KNOWN_TOPICS.indexOf(b)
    if (ia !== -1 && ib !== -1) return ia - ib
    if (ia !== -1) return -1
    if (ib !== -1) return 1
    return a.localeCompare(b)
  })

  function toggleTopic(topic: string) {
    setExpandedTopics((prev) => {
      const next = new Set(prev)
      if (next.has(topic)) next.delete(topic)
      else next.add(topic)
      return next
    })
  }

  function toggleCat(cat: string) {
    setExpandedCats((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-2">
        <div className="mb-2 px-2 text-xs font-semibold uppercase text-muted-foreground">
          {project.name}
        </div>

        {sortedTopics.length === 0 && (
          <div className="px-2 py-4 text-center text-xs text-muted-foreground">
            No wiki pages yet. Import sources to get started.
          </div>
        )}

        {sortedTopics.map((topic) => {
          const catMap = topicMap.get(topic)!
          const total = [...catMap.values()].reduce((s, v) => s + v.length, 0)
          const isTopicExpanded = expandedTopics.has(topic)

          return (
            <div key={topic} className="mb-1">
              <button
                onClick={() => toggleTopic(topic)}
                className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium hover:bg-accent/50"
              >
                {isTopicExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className="flex-1 text-left">{topic}</span>
                <span className="text-xs text-muted-foreground">{total}</span>
              </button>

              {isTopicExpanded && (
                <div className="ml-3">
                  {[...catMap.entries()]
                    .sort((a, b) => {
                      const oA = CATEGORY_CONFIG[a[0]]?.order ?? DEFAULT_CONFIG.order
                      const oB = CATEGORY_CONFIG[b[0]]?.order ?? DEFAULT_CONFIG.order
                      return oA - oB
                    })
                    .map(([cat, items]) => {
                      const cfg = CATEGORY_CONFIG[cat] ?? DEFAULT_CONFIG
                      const Icon = cfg.icon
                      const isCatExpanded = expandedCats.has(cat)

                      return (
                        <div key={cat} className="mb-0.5">
                          <button
                            onClick={() => toggleCat(cat)}
                            className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-xs hover:bg-accent/50"
                          >
                            {isCatExpanded ? (
                              <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                            )}
                            <Icon className={`h-3 w-3 shrink-0 ${cfg.color}`} />
                            <span className="flex-1 text-left">{cfg.label}</span>
                            <span className="text-[10px] text-muted-foreground">{items.length}</span>
                          </button>

                          {isCatExpanded && (
                            <div className="ml-3">
                              {items.map((page) => {
                                const isSelected = selectedFile === page.path
                                return (
                                  <button
                                    key={page.path}
                                    onClick={() => setSelectedFile(page.path)}
                                    className={`flex w-full items-center gap-1.5 rounded-md px-2 py-0.5 text-left text-xs ${
                                      isSelected
                                        ? "bg-accent text-accent-foreground"
                                        : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground"
                                    }`}
                                    title={page.path}
                                  >
                                    {page.origin === "web-clip" && <Globe className="h-2.5 w-2.5 shrink-0 text-blue-400" />}
                                    <span className="truncate">{page.title}</span>
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                </div>
              )}
            </div>
          )
        })}

        <RawSourcesSection />
      </div>
    </ScrollArea>
  )
}

function RawSourcesSection() {
  const project = useWikiStore((s) => s.project)
  const setSelectedFile = useWikiStore((s) => s.setSelectedFile)
  const selectedFile = useWikiStore((s) => s.selectedFile)
  const [expanded, setExpanded] = useState(false)
  const [sources, setSources] = useState<FileNode[]>([])

  useEffect(() => {
    if (!project) return
    const pp = normalizePath(project.path)
    listDirectory(`${pp}/raw/sources`)
      .then((tree) => setSources(flattenAllFiles(tree)))
      .catch(() => setSources([]))
  }, [project])

  if (sources.length === 0) return null

  return (
    <div className="mt-2 border-t pt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent/50"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <BookOpen className="h-3.5 w-3.5 shrink-0 text-amber-600" />
        <span className="flex-1 text-left font-medium text-muted-foreground">Raw Sources</span>
        <span className="text-xs text-muted-foreground">{sources.length}</span>
      </button>
      {expanded && (
        <div className="ml-3">
          {sources.map((file) => {
            const isSelected = selectedFile === file.path
            return (
              <button
                key={file.path}
                onClick={() => setSelectedFile(file.path)}
                className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm ${
                  isSelected
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground"
                }`}
              >
                <span className="truncate">{file.name}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function parsePageInfo(path: string, fileName: string, content: string): WikiPageInfo {
  let type = "other"
  let topic = "other"
  let title = fileName.replace(".md", "").replace(/-/g, " ")
  const tags: string[] = []
  let origin: string | undefined

  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/)
  if (fmMatch) {
    const fm = fmMatch[1]
    const typeMatch = fm.match(/^type:\s*(.+)$/m)
    if (typeMatch) type = typeMatch[1].trim()

    const titleMatch = fm.match(/^title:\s*["']?(.+?)["']?\s*$/m)
    if (titleMatch) title = titleMatch[1].trim()

    const tagsMatch = fm.match(/^tags:\s*\[(.+?)\]/m)
    if (tagsMatch) {
      tags.push(...tagsMatch[1].split(",").map((t) => t.trim().replace(/["']/g, "")))
    }

    const originMatch = fm.match(/^origin:\s*(.+)$/m)
    if (originMatch) origin = originMatch[1].trim()
  }

  if (title === fileName.replace(".md", "").replace(/-/g, " ")) {
    const headingMatch = content.match(/^#\s+(.+)$/m)
    if (headingMatch) title = headingMatch[1].trim()
  }

  // Extract topic from path: wiki/{topic}/{category}/{page}.md
  // Split on "/" and find the known topic at position 1 (index 1 after "wiki")
  const parts = normalizePath(path).split("/").filter(Boolean)
  // parts: ["...","wiki","关联方关系及其交易的性质","准则","page.md"]
  for (let i = 1; i < parts.length - 2; i++) {
    if (KNOWN_TOPICS.includes(parts[i])) {
      topic = parts[i]
      break
    }
  }

  if (type === "other") {
    if (path.includes("/准则/")) type = "准则"
    else if (path.includes("/审计方法论/")) type = "审计方法论"
    else if (path.includes("/指引性文件/")) type = "指引性文件"
    else if (path.includes("/Enablement/")) type = "enablement"
    else if (path.includes("/FAQ/")) type = "faq"
    else if (path.includes("/entities/")) type = "entity"
    else if (path.includes("/concepts/")) type = "concept"
    else if (path.includes("/sources/")) type = "source"
    else if (path.includes("/queries/")) type = "query"
    else if (path.includes("/comparisons/")) type = "comparison"
    else if (path.includes("/synthesis/")) type = "synthesis"
    else if (fileName === "overview.md") type = "overview"
  }

  return { path, title, type, topic, tags, origin }
}

function flattenMdFiles(nodes: FileNode[]): FileNode[] {
  const files: FileNode[] = []
  for (const node of nodes) {
    if (node.is_dir && node.children) {
      files.push(...flattenMdFiles(node.children))
    } else if (!node.is_dir && node.name.endsWith(".md")) {
      files.push(node)
    }
  }
  return files
}

function flattenAllFiles(nodes: FileNode[]): FileNode[] {
  const files: FileNode[] = []
  for (const node of nodes) {
    if (node.is_dir && node.children) {
      files.push(...flattenAllFiles(node.children))
    } else if (!node.is_dir) {
      files.push(node)
    }
  }
  return files
}
