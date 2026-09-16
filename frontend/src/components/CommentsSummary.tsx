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

interface CommentsSummaryProps {
  isOpen: boolean;
  onClose: () => void;
  tableName: string;
}

export function CommentsSummary({ isOpen, onClose, tableName }: CommentsSummaryProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchUser, setSearchUser] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchAllComments();
    }
  }, [isOpen, tableName]);

  const fetchAllComments = async () => {
    setIsLoading(true);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
      const response = await axios.get(`${apiUrl}/comments/summary/${tableName}`);
      setComments(response.data);
    } catch (error) {
      console.error('Error fetching comments summary:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteComment = async (id: number) => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
      await axios.delete(`${apiUrl}/comments/${id}`);
      await fetchAllComments();
    } catch (error) {
      console.error('Error deleting comment:', error);
    }
  };

  const filteredComments = searchUser
    ? comments.filter((c) => c.user.toLowerCase().includes(searchUser.toLowerCase()))
    : comments;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[60vh] flex flex-col">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          Comments Summary - {tableName}
        </h2>

        {/* Search */}
        <div className="mb-4">
          <input
            type="text"
            placeholder="Filter by user..."
            value={searchUser}
            onChange={(e) => setSearchUser(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Comments List */}
        <div className="flex-1 overflow-y-auto border border-gray-200 rounded p-3 mb-4">
          {isLoading ? (
            <p className="text-gray-500 text-sm">Loading comments...</p>
          ) : filteredComments.length === 0 ? (
            <p className="text-gray-500 text-sm">
              {comments.length === 0 ? 'No comments yet' : 'No matching comments'}
            </p>
          ) : (
            <div className="space-y-3">
              {filteredComments.map((comment) => (
                <div
                  key={comment.id}
                  className="bg-gray-50 p-3 rounded border-l-4 border-blue-500"
                >
                  <div className="flex justify-between items-start mb-1">
                    <div>
                      <span className="font-medium text-sm text-gray-900">
                        {comment.user}
                      </span>
                      <span className="text-xs text-gray-500 ml-2">
                        Quote: {comment.quote_no}, Line: {comment.line_no}
                      </span>
                    </div>
                    <button
                      onClick={() => handleDeleteComment(comment.id)}
                      className="text-red-500 hover:text-red-700 text-xs font-bold"
                    >
                      ✕
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mb-2">
                    Column: <span className="font-mono">{comment.column_name}</span>
                  </p>
                  <p className="text-xs text-gray-500 mb-2">
                    {new Date(comment.timestamp).toLocaleString()}
                  </p>
                  <p className="text-sm text-gray-700 bg-white p-2 rounded">
                    {comment.comment_text}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="text-xs text-gray-600 mb-4">
          Showing {filteredComments.length} of {comments.length} comments
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="w-full px-4 py-2 bg-gray-300 text-gray-900 rounded-lg hover:bg-gray-400 font-medium"
        >
          Close
        </button>
      </div>
    </div>
  );
}
