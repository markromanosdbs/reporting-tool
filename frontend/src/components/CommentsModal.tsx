import { useState, useEffect } from 'react';
import axios from 'axios';

interface Comment {
  id: number;
  table_name: string;
  quote_no: string;
  line_no: number;
  column_name: string;
  user: string;
  timestamp: string;
  comment_text: string;
}

interface CommentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  table: string;
  quoteNo: string;
  lineNo: number;
  columnName: string;
  username: string;
}

export function CommentsModal({
  isOpen,
  onClose,
  table,
  quoteNo,
  lineNo,
  columnName,
  username,
}: CommentsModalProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchComments();
    }
  }, [isOpen, table, quoteNo, lineNo]);

  const fetchComments = async () => {
    try {
      const response = await axios.get('/api/comments', {
        params: {
          table,
          quoteNo,
          lineNo,
        },
      });
      setComments(response.data);
    } catch (error) {
      console.error('Error fetching comments:', error);
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;

    setIsLoading(true);
    const payload = {
      table,
      quoteNo,
      lineNo,
      columnName,
      user: username,
      commentText: newComment,
    };

    console.log('Sending comment:', payload);

    try {
      const response = await axios.post('/api/comments', payload);
      console.log('Comment response:', response);
      setNewComment('');
      await fetchComments();
    } catch (error) {
      console.error('Error adding comment:', error);
      alert('Error adding comment: ' + (error as any).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteComment = async (id: number) => {
    try {
      await axios.delete(`/api/comments/${id}`);
      await fetchComments();
    } catch (error) {
      console.error('Error deleting comment:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 max-h-96 flex flex-col">
        <h2 className="text-xl font-bold text-gray-900 mb-2">
          Comments - {columnName}
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Quote: {quoteNo} | Line: {lineNo}
        </p>

        {/* Comments List */}
        <div className="flex-1 overflow-y-auto mb-4 border border-gray-200 rounded p-3">
          {comments.length === 0 ? (
            <p className="text-gray-500 text-sm">No comments yet</p>
          ) : (
            <div className="space-y-3">
              {comments.map((comment) => (
                <div
                  key={comment.id}
                  className="bg-gray-50 p-3 rounded border-l-2 border-blue-500"
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-medium text-sm text-gray-900">
                      {comment.user}
                    </span>
                    {comment.user === username && (
                      <button
                        onClick={() => handleDeleteComment(comment.id)}
                        className="text-red-500 hover:text-red-700 text-xs"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mb-1">
                    {new Date(comment.timestamp).toLocaleString()}
                  </p>
                  <p className="text-sm text-gray-700">{comment.comment_text}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add Comment */}
        <div className="mb-4">
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a comment..."
            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            rows={3}
          />
        </div>

        {/* Buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleAddComment}
            disabled={isLoading || !newComment.trim()}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium text-sm disabled:bg-gray-400"
          >
            Add Comment
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-gray-300 text-gray-900 rounded hover:bg-gray-400 font-medium text-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
