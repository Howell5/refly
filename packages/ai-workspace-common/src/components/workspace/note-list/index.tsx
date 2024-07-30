import { useEffect } from 'react';
import { time } from '@refly-packages/ai-workspace-common/utils/time';
import { useTranslation } from 'react-i18next';

import getClient from '@refly-packages/ai-workspace-common/requests/proxiedRequest';

import { Note } from '@refly/openapi-schema';
import { List, Empty } from '@arco-design/web-react';
import { IconBook } from '@arco-design/web-react/icon';
import { CardBox } from '../card-box';
import { ScrollLoading } from '../scroll-loading';
import { useKnowledgeBaseJumpNewPath } from '@refly-packages/ai-workspace-common/hooks/use-jump-new-path';
import { NoteDropdownMenu } from '@refly-packages/ai-workspace-common/components/knowledge-base/note-dropdown-menu';
import { useFetchDataList } from '@refly-packages/ai-workspace-common/hooks/use-fetch-data-list';

import { LOCALE } from '@refly/common-types';
import './index.scss';

export const NoteList = () => {
  const { i18n } = useTranslation();
  const language = i18n.languages?.[0];

  const { dataList, loadMore, hasMore, isRequesting } = useFetchDataList({
    fetchData: async (queryPayload) => {
      const res = await getClient().listNotes({
        query: queryPayload,
      });
      return res?.data;
    },
    pageSize: 12,
  });

  useEffect(() => {
    loadMore();
  }, []);

  const { jumpToNote } = useKnowledgeBaseJumpNewPath();

  if (dataList.length === 0) {
    return <Empty />;
  }

  return (
    <List
      grid={{
        sm: 24,
        md: 12,
        lg: 8,
        xl: 6,
      }}
      className="workspace-list note-list"
      wrapperStyle={{ width: '100%' }}
      bordered={false}
      pagination={false}
      offsetBottom={50}
      dataSource={dataList}
      scrollLoading={<ScrollLoading isRequesting={isRequesting} hasMore={hasMore} loadMore={loadMore} />}
      render={(item: Note, key) => (
        <List.Item
          key={item?.noteId + key}
          style={{
            padding: '20px 0',
          }}
          className="knowledge-base-list-item-container"
          actionLayout="vertical"
          onClick={() => jumpToNote({ noteId: item.noteId })}
          actions={[
            <CardBox
              cardData={item}
              type="knowledge"
              cardIcon={<IconBook style={{ fontSize: '32px', strokeWidth: 3 }} />}
              onClick={() => jumpToNote({ noteId: item.noteId })}
            >
              <div className="flex items-center justify-between mt-6">
                <div className="text-xs text-black/40">
                  {time(item.updatedAt, language as LOCALE)
                    .utc()
                    .fromNow()}
                </div>
                <div className="flex items-center">
                  <IconBook style={{ color: '#819292', cursor: 'pointer' }} />
                  <NoteDropdownMenu note={item} />
                </div>
              </div>
            </CardBox>,
          ]}
        ></List.Item>
      )}
    />
  );
};
