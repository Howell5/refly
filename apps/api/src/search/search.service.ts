import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/common/prisma.service';
import {
  Entity,
  EntityType,
  ResourceMeta,
  ResourceType,
  SearchOptions,
  SearchRequest,
  SearchResult,
  User,
  WebSearchRequest,
  WebSearchResult,
  BatchWebSearchRequest,
} from '@refly-packages/openapi-schema';
import { RAGService } from '@/rag/rag.service';
import { ElasticsearchService } from '@/common/elasticsearch.service';
import { LOCALE } from '@refly-packages/common-types';
import { ParamsError } from '@refly-packages/errors';

interface ProcessedSearchRequest extends SearchRequest {}

@Injectable()
export class SearchService {
  private logger = new Logger(SearchService.name);

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private elasticsearch: ElasticsearchService,
    private rag: RAGService,
  ) {}

  async preprocessSearchRequest(user: User, req: SearchRequest): Promise<SearchRequest[]> {
    req.query = req.query?.trim() || '';

    if (!req.limit || req.limit <= 0) {
      req.limit = 5;
    }
    if (req.limit > 10) {
      req.limit = 10;
    }
    req.mode ??= 'keyword';

    if (req.mode === 'vector') {
      // Currently only resource and canvas are supported for vector search
      req.domains ??= ['resource', 'canvas'];
    } else {
      req.domains ??= ['resource', 'canvas', 'project', 'conversation', 'skill'];
    }

    const reqList: SearchRequest[] = [];

    if (req.entities?.length > 0) {
      const entities = req.entities.filter((entity) => req.domains.includes(entity.entityType));
      if (entities.length === 0) {
        return [];
      }

      // Add project resources to entities
      const projectIds = entities
        .filter((entity) => entity.entityType === 'project')
        .map((entity) => entity.entityId);
      if (projectIds.length > 0) {
        const relations = await this.prisma.projectResourceRelation.findMany({
          select: { resourceId: true },
          where: { projectId: { in: projectIds } },
        });
        relations.forEach((relation) => {
          entities.push({
            entityType: 'resource',
            entityId: relation.resourceId,
          });
        });
      }

      const entityMap = new Map<EntityType, Set<Entity>>();

      entities.forEach((entity) => {
        const entitySet = entityMap.get(entity.entityType) || new Set<Entity>();
        entitySet.add(entity);
        entityMap.set(entity.entityType, entitySet);
      });

      entityMap.forEach((entitySet, entityType) => {
        reqList.push({
          ...req,
          domains: [entityType],
          entities: Array.from(entitySet),
        });
      });
    } else {
      req.domains.forEach((domain) => {
        reqList.push({ ...req, domains: [domain] });
      });
    }

    return reqList;
  }

  async emptySearchResources(user: User, req: ProcessedSearchRequest): Promise<SearchResult[]> {
    const results = await this.prisma.resource.findMany({
      select: {
        resourceId: true,
        resourceType: true,
        title: true,
        contentPreview: true,
        createdAt: true,
        updatedAt: true,
      },
      where: {
        uid: user.uid,
        deletedAt: null,
      },
      orderBy: { updatedAt: 'desc' },
      take: req.limit || 5,
    });

    return results.map((result) => ({
      id: result.resourceId,
      domain: 'resource',
      title: result.title,
      highlightedTitle: result.title,
      snippets: [{ text: result.contentPreview, highlightedText: result.contentPreview }],
      metadata: {
        resourceType: result.resourceType as ResourceType,
      },
      createdAt: result.createdAt.toJSON(),
      updatedAt: result.updatedAt.toJSON(),
    }));
  }

  async searchResourcesByKeywords(
    user: User,
    req: ProcessedSearchRequest,
  ): Promise<SearchResult[]> {
    const hits = await this.elasticsearch.searchResources(user, req);

    return hits.map((hit) => ({
      id: hit._id,
      domain: 'resource',
      title: hit._source.title,
      highlightedTitle: hit.highlight?.title?.[0] || hit._source.title,
      snippets: [
        {
          text: hit._source.content,
          highlightedText: hit.highlight?.content?.[0] || hit._source.content,
        },
      ],
      metadata: {
        // TODO: confirm if metadata is used
      },
      createdAt: hit._source.createdAt,
      updatedAt: hit._source.updatedAt,
    }));
  }

  async searchResourcesByVector(user: User, req: ProcessedSearchRequest): Promise<SearchResult[]> {
    const nodes = await this.rag.retrieve(user, {
      query: req.query,
      limit: req.limit,
      filter: {
        nodeTypes: ['resource'],
        resourceIds: req.entities?.map((entity) => entity.entityId),
      },
    });
    if (nodes.length === 0) {
      return [];
    }

    const resourceIds = [...new Set(nodes.map((node) => node.resourceId).filter((id) => !!id))];
    const resources = await this.prisma.resource.findMany({
      where: {
        resourceId: { in: resourceIds },
        deletedAt: null,
      },
    });
    const resourceMap = new Map(
      resources.map((resource) => [resource.resourceId, JSON.parse(resource.meta) as ResourceMeta]),
    );

    return nodes.map((node) => ({
      id: node.resourceId,
      domain: 'resource',
      title: node.title,
      highlightedTitle: node.title,
      snippets: [{ text: node.content, highlightedText: node.content }],
      metadata: {
        resourceMeta: resourceMap.get(node.resourceId),
        resourceType: node.resourceType,
      },
    }));
  }

  async searchResources(user: User, req: ProcessedSearchRequest): Promise<SearchResult[]> {
    if (req.query.length === 0) {
      return this.emptySearchResources(user, req);
    }

    switch (req.mode) {
      case 'keyword':
        return this.searchResourcesByKeywords(user, req);
      case 'vector':
        return this.searchResourcesByVector(user, req);
      case 'hybrid':
        throw new ParamsError('Not implemented');
      default:
        return this.searchResourcesByKeywords(user, req);
    }
  }

  async emptySearchCanvases(user: User, req: ProcessedSearchRequest): Promise<SearchResult[]> {
    const canvases = await this.prisma.canvas.findMany({
      select: {
        canvasId: true,
        projectId: true,
        title: true,
        content: true,
        createdAt: true,
        updatedAt: true,
      },
      where: { uid: user.uid, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      take: req.limit || 5,
    });
    return canvases.map((canvas) => ({
      id: canvas.canvasId,
      domain: 'canvas',
      title: canvas.title,
      highlightedTitle: canvas.title,
      snippets: [
        { text: canvas.content ? canvas.content.slice(0, 250) + '...' : '', highlightedText: '' },
      ],
      createdAt: canvas.createdAt.toJSON(),
      updatedAt: canvas.updatedAt.toJSON(),
      metadata: {
        projectId: canvas.projectId,
      },
    }));
  }

  async searchCanvasesByKeywords(user: User, req: ProcessedSearchRequest): Promise<SearchResult[]> {
    const hits = await this.elasticsearch.searchCanvases(user, req);

    return hits.map((hit) => ({
      id: hit._id,
      domain: 'canvas',
      title: hit._source.title,
      highlightedTitle: hit.highlight?.title?.[0] || hit._source.title,
      snippets: [
        {
          text: hit._source.content,
          highlightedText: hit.highlight?.content?.[0] || hit._source.content,
        },
      ],
      createdAt: hit._source.createdAt,
      updatedAt: hit._source.updatedAt,
      metadata: {
        projectId: hit._source.projectId,
      },
    }));
  }

  async searchCanvasesByVector(user: User, req: ProcessedSearchRequest): Promise<SearchResult[]> {
    const nodes = await this.rag.retrieve(user, {
      query: req.query,
      limit: req.limit,
      filter: {
        nodeTypes: ['canvas'],
        canvasIds: req.entities?.map((entity) => entity.entityId),
      },
    });
    if (nodes.length === 0) {
      return [];
    }

    return nodes.map((node) => ({
      id: node.canvasId,
      domain: 'canvas',
      title: node.title,
      highlightedTitle: node.title,
      snippets: [{ text: node.content, highlightedText: node.content }],
      metadata: {
        projectId: node.projectId,
      },
    }));
  }

  async searchCanvases(user: User, req: ProcessedSearchRequest): Promise<SearchResult[]> {
    if (req.query.length === 0) {
      return this.emptySearchCanvases(user, req);
    }

    switch (req.mode) {
      case 'keyword':
        return this.searchCanvasesByKeywords(user, req);
      case 'vector':
        return this.searchCanvasesByVector(user, req);
      case 'hybrid':
        throw new ParamsError('Not implemented');
      default:
        return this.searchCanvasesByKeywords(user, req);
    }
  }

  async emptySearchProjects(user: User, req: ProcessedSearchRequest): Promise<SearchResult[]> {
    const projects = await this.prisma.project.findMany({
      select: {
        projectId: true,
        title: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
      where: { uid: user.uid, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      take: req.limit || 5,
    });
    return projects.map((project) => ({
      id: project.projectId,
      domain: 'project',
      title: project.title,
      highlightedTitle: project.title,
      snippets: [{ text: project.description, highlightedText: project.description }],
      createdAt: project.createdAt.toJSON(),
      updatedAt: project.updatedAt.toJSON(),
    }));
  }

  async searchProjects(user: User, req: ProcessedSearchRequest): Promise<SearchResult[]> {
    if (req.query.length === 0) {
      return this.emptySearchProjects(user, req);
    }

    const hits = await this.elasticsearch.searchProjects(user, req);

    return hits.map((hit) => ({
      id: hit._id,
      domain: 'project',
      title: hit._source.title,
      highlightedTitle: hit.highlight?.title?.[0] || hit._source.title,
      snippets: [
        {
          text: hit._source.description,
          highlightedText: hit.highlight?.description?.[0] || hit._source.description,
        },
      ],
      createdAt: hit._source.createdAt,
      updatedAt: hit._source.updatedAt,
    }));
  }

  async emptySearchConversations(user: User, req: ProcessedSearchRequest): Promise<SearchResult[]> {
    const conversations = await this.prisma.conversation.findMany({
      select: {
        convId: true,
        title: true,
        lastMessage: true,
        createdAt: true,
        updatedAt: true,
      },
      where: { uid: user.uid },
      orderBy: { updatedAt: 'desc' },
      take: req.limit || 5,
    });
    return conversations.map((conversation) => ({
      id: conversation.convId,
      domain: 'conversation',
      title: conversation.title,
      highlightedTitle: conversation.title,
      snippets: [{ text: conversation.lastMessage, highlightedText: conversation.lastMessage }],
      createdAt: conversation.createdAt.toJSON(),
      updatedAt: conversation.updatedAt.toJSON(),
    }));
  }

  async searchConversations(user: User, req: ProcessedSearchRequest): Promise<SearchResult[]> {
    if (req.query.length === 0) {
      return this.emptySearchConversations(user, req);
    }

    const hits = await this.elasticsearch.searchConversationMessages(user, req);

    return hits.map((hit) => ({
      id: hit._source.convId,
      domain: 'conversation',
      title: hit._source.convTitle,
      highlightedTitle: hit.highlight?.convTitle?.[0] || hit._source.convTitle,
      snippets: [
        {
          text: hit._source.content,
          highlightedText: hit.highlight?.content?.[0] || hit._source.content,
        },
      ],
      createdAt: hit._source.createdAt,
      updatedAt: hit._source.updatedAt,
    }));
  }

  async emptySearchSkills(user: User, req: ProcessedSearchRequest): Promise<SearchResult[]> {
    const skills = await this.prisma.skillInstance.findMany({
      where: { uid: user.uid, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      take: req.limit || 5,
    });
    return skills.map((skill) => ({
      id: skill.skillId,
      domain: 'skill',
      title: skill.displayName,
      highlightedTitle: skill.displayName,
      snippets: [{ text: skill.description, highlightedText: skill.description }],
      createdAt: skill.createdAt.toJSON(),
      updatedAt: skill.updatedAt.toJSON(),
    }));
  }

  async searchSkills(user: User, req: ProcessedSearchRequest): Promise<SearchResult[]> {
    if (req.query.length === 0) {
      return this.emptySearchSkills(user, req);
    }

    const hits = await this.elasticsearch.searchSkills(user, req);

    return hits.map((hit) => ({
      id: hit._id,
      domain: 'skill',
      title: hit._source.displayName,
      highlightedTitle: hit.highlight?.displayName?.[0] || hit._source.displayName,
      snippets: [
        {
          text: hit._source.description,
          highlightedText: hit.highlight?.description?.[0] || hit._source.description,
        },
      ],
      createdAt: hit._source.createdAt,
      updatedAt: hit._source.updatedAt,
    }));
  }

  async webSearch(
    user: User,
    req: WebSearchRequest | BatchWebSearchRequest,
  ): Promise<WebSearchResult[]> {
    const limit = req?.limit || 10;

    try {
      const queries = 'queries' in req ? req.queries : [req];
      const queryPayload = queries.map((query) => ({
        ...query,
        num: limit,
        gl: 'us', // TODO: support multiple locales
        location: 'United States', // TODO: support multiple locations
      }));

      const res = await fetch('https://google.serper.dev/search', {
        method: 'post',
        headers: {
          'X-API-KEY': this.configService.get('credentials.serper'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(queryPayload),
      });

      const jsonContent = await res.json();
      const results = this.parseSearchResults(jsonContent);

      return 'queries' in req ? results : results?.slice(0, limit);
    } catch (e) {
      this.logger.error(`Batch web search error: ${e}`);
      return [];
    }
  }

  // Helper to parse results consistently
  private parseSearchResults(jsonContent: any): WebSearchResult[] {
    const contexts: WebSearchResult[] = [];

    if (Array.isArray(jsonContent)) {
      // Handle batch results
      for (const result of jsonContent) {
        contexts.push(...this.parseSingleSearchResult(result));
      }
    } else {
      // Handle single result
      contexts.push(...this.parseSingleSearchResult(jsonContent));
    }

    return contexts;
  }

  private parseSingleSearchResult(result: any): WebSearchResult[] {
    const contexts: WebSearchResult[] = [];

    if (result.knowledgeGraph) {
      const url = result.knowledgeGraph.descriptionUrl || result.knowledgeGraph.website;
      const snippet = result.knowledgeGraph.description;
      if (url && snippet) {
        contexts.push({
          name: result.knowledgeGraph.title || '',
          url,
          snippet,
        });
      }
    }

    if (result.answerBox) {
      const url = result.answerBox.url;
      const snippet = result.answerBox.snippet || result.answerBox.answer;
      if (url && snippet) {
        contexts.push({
          name: result.answerBox.title || '',
          url,
          snippet,
        });
      }
    }

    if (result.organic) {
      for (const c of result.organic) {
        contexts.push({
          name: c.title,
          url: c.link,
          snippet: c.snippet || '',
        });
      }
    }

    return contexts;
  }

  async search(user: User, req: SearchRequest, options?: SearchOptions): Promise<SearchResult[]> {
    const reqList = await this.preprocessSearchRequest(user, req);

    const results = await Promise.all(
      reqList.map((req) => {
        switch (req.domains[0]) {
          case 'resource':
            return this.searchResources(user, req);
          case 'canvas':
            return this.searchCanvases(user, req);
          case 'project':
            return this.searchProjects(user, req);
          case 'conversation':
            return this.searchConversations(user, req);
          case 'skill':
            return this.searchSkills(user, req);
          default:
            return [] as SearchResult[];
        }
      }),
    );

    if (options?.enableReranker) {
      this.logger.log(`Reranker enabled for query: ${req.query}`);
      const rerankedResults = await this.rag.rerank(req.query, results.flat());
      this.logger.log(`Reranked results: ${JSON.stringify(rerankedResults)}`);

      return rerankedResults;
    }

    return results.flat();
  }
}
