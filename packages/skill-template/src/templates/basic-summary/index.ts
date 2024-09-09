import { Document } from '@langchain/core/documents';
import { BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';

import { START, END, StateGraphArgs, StateGraph } from '@langchain/langgraph';
import { BaseSkill, BaseSkillState, SkillRunnableConfig, baseStateGraphArgs } from '../../base';
// schema
import { z } from 'zod';
import { SkillInvocationConfig, SkillTemplateConfigSchema } from '@refly/openapi-schema';

interface GraphState extends BaseSkillState {
  documents: Document[];
  messages: BaseMessage[];
}

// Define a new graph

export class BasicSummarySkill extends BaseSkill {
  name = 'basic_summary';
  displayName = {
    en: 'Basic Summary',
    'zh-CN': '基础总结',
  };

  configSchema: SkillTemplateConfigSchema = {
    items: [],
  };

  invocationConfig: SkillInvocationConfig = {
    input: {
      rules: [{ key: 'query' }],
    },
    context: {
      relation: 'mutuallyExclusive',
      rules: [
        { key: 'resources', limit: 1 },
        { key: 'notes', limit: 1 },
        { key: 'contentList', limit: 1 },
      ],
    },
  };

  description = 'Give a summary of the given context';

  schema = z.object({
    query: z.string().describe('The user query'),
  });

  graphState: StateGraphArgs<GraphState>['channels'] = {
    ...baseStateGraphArgs,
    documents: {
      reducer: (left?: Document[], right?: Document[]) => (right ? right : left || []),
      default: () => [],
    },
    messages: {
      reducer: (x: BaseMessage[], y: BaseMessage[]) => x.concat(y),
      default: () => [],
    },
  };

  async generate(state: GraphState, config?: SkillRunnableConfig) {
    this.engine.logger.log('---GENERATE---');

    const { documents } = state;
    const { locale = 'en', notes = [], resources = [], contentList = [] } = config?.configurable || {};

    // 1. build context text
    const contextToCitationText = documents.reduce((total, cur) => {
      (total += `\n\n下面是网页 [${cur?.metadata?.title}](${cur?.metadata?.source}) 的内容\n\n`),
        (total += `\n===\n${cur?.pageContent}\n===\n\n`);

      return total;
    }, '');

    let contentListText = '';
    if (resources?.length > 0) {
      contentListText = resources[0].resource?.content;
    } else if (notes?.length > 0) {
      contentListText = notes[0].note?.content;
    } else if (contentList?.length > 0) {
      contentListText = contentList.map((item, index) => `${index + 1}. ${item.content}`).join('\n\n');
    }

    const llm = this.engine.chatModel({
      temperature: 0.9,
      maxTokens: 1024,
    });

    // 2. pass context text to llm
    const systemPrompt = `# IDENTITY and PURPOSE

You are an expert content summarizer. You take content in and output a Markdown formatted summary using the format below.

Take a deep breath and think step by step about how to best accomplish this goal using the following steps.

# OUTPUT SECTIONS

- Combine all of your understanding of the content into a single, 20-word sentence in a section called ONE SENTENCE SUMMARY:.

- Output the 10 most important points of the content as a list with no more than 15 words per point into a section called MAIN POINTS:.

- Output a list of the 5 best takeaways from the content in a section called TAKEAWAYS:.

# OUTPUT INSTRUCTIONS

- Create the output using the formatting above.
- You only output human readable Markdown.
- Output numbered lists, not bullets.
- Do not output warnings or notes—just the requested sections.
- Do not repeat items in the output sections.
- Do not start items with the same opening words.
- The title of each section should be in ${locale} language, includes "ONE SENTENCE SUMMARY"、"MAIN POINTS" and "TAKEAWAYS". 
> Example for "MAIN POINTS": when locale = "en", the title should be "MAIN POINTS:", when locale = "zh-CN", the title should be "主要观点:"
> Please apply example to all three sections.

## EXAMPLE

when locale = "en"

### ONE SENTENCE SUMMARY:

### MAIN POINTS:

### TAKEAWAYS:

when locale = "zh-CN"

### 一句话总结:

### 主要观点:

### 要点总结:

# INPUT:
"""
{input}
"""
`;

    const contextString = contentList.length > 0 ? contentListText : '';

    const prompt = systemPrompt.replace(`{input}`, contextString);
    const responseMessage = await llm.invoke([
      new SystemMessage(prompt),
      new HumanMessage(`Please generate a summary based on the input in ${locale} language:`),
    ]);

    return { messages: [responseMessage] };
  }

  toRunnable() {
    const workflow = new StateGraph<GraphState>({
      channels: this.graphState,
    })
      .addNode('generate', this.generate.bind(this))
      .addEdge(START, 'generate')
      .addEdge('generate', END);

    return workflow.compile();
  }
}
