import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  en: {
    translation: {
      nav: {
        home: 'Home',
        addGame: '+ Add',
        admin: 'Admin',
        login: 'Login',
        language: 'Language'
      },
      admin: {
        tabs: {
          games: 'Games',
          users: 'Users',
          logs: 'Audit Logs'
        },
        showTrash: 'Show Trash',
        hideTrash: 'Hide Trash',
        restore: 'Restore',
        trashed: 'TRASHED',
        loading: 'Loading admin data...',
        logsEmpty: 'No audit logs yet',
        logsLoading: 'Loading audit logs...'
      },
      addGame: {
        loading: 'Loading...',
        pageTitle: 'Add Your Game',
        errors: {
          required: 'Please enter game title and a valid URL.',
          invalidUrl: 'Invalid game URL.',
          submitFailed: 'Unable to add game. Please check login status and URL.'
        },
        fields: {
          title: 'Game Title *',
          gameUrl: 'Game URL (Embed Link) *',
          gameUrlHelp: 'Make sure the URL allows embedding (iframe). Itch.io, Newgrounds, or direct HTML5 links work best.',
          description: 'Description',
          imageUrl: 'Thumbnail Image URL',
          tags: 'Tags (comma separated)',
          quickTags: 'Quick pick existing tags',
          selectedTags: 'Selected tags',
          publisher: 'Publisher',
          players: 'Players',
          controls: 'Controls',
          difficulty: 'Difficulty'
        },
        placeholders: {
          title: 'e.g. Super Mario Clone',
          gameUrl: 'e.g. https://itch.io/embed-upload/...',
          description: 'Short description of the game...',
          imageUrl: 'https://...',
          tags: 'Action, Puzzle, Retro',
          publisher: 'e.g. Indie Studio',
          players: 'e.g. 1 Player, Multiplayer',
          controls: 'e.g. Keyboard, Mouse'
        },
        actions: {
          cancel: 'Cancel',
          add: 'Add Game',
          adding: 'Adding...'
        },
        states: {
          noExistingTags: 'No existing tags yet.'
        }
      },
      home: {
        alerts: {
          loginToFavorite: 'Please login to add favorites!'
        },
        hero: {
          version: 'v1.0.0 • BETA ACCESS',
          titleTop: 'NEXT GEN',
          titleBottom: 'BROWSER GAMING',
          subtitleLine1: 'Forget downloads. Forget loading screens.',
          subtitleLine2: 'Instant access to curated, high-performance web games.',
          startPlaying: 'START PLAYING',
          github: 'GITHUB',
          scrollToExplore: 'Scroll to explore'
        },
        section: {
          trending: 'TRENDING',
          games: 'GAMES',
          mostPlayed: 'MOST PLAYED THIS WEEK'
        },
        search: {
          console: 'Search Console',
          title: 'Find by name & tag stack',
          resetAll: 'Reset All ×',
          tip: 'Tip: Combine name + tags for better results',
          placeholder: 'Search game title...',
          button: 'Search',
          active: 'Active',
          matchAll: 'Match All',
          matchAny: 'Match Any',
          matchAnyHelp: 'Select at least 2 tags to use Match Any mode.',
          currentMode: 'Current mode: {{mode}}',
          quickTags: 'Quick Tags',
          allTag: '#all'
        },
        states: {
          loadingGames: 'Loading games...',
          noMatch: 'No games match current filters.',
          clearFilters: 'Clear all filters',
          noGames: 'No embedded games found.',
          addGameHint: 'Add a game with an embeddable URL to start playing.'
        },
        summary: {
          name: 'NAME: "{{query}}"',
          singleTag: 'TAG: #{{tag}}',
          multiTag: '{{mode}} OF {{count}} TAGS'
        },
        noResults: {
          name: 'name "{{query}}"',
          tags: '{{mode}} tags: {{tags}}'
        }
      },
      gameDetail: {
        loading: 'Loading game details...',
        notFoundTitle: 'Game Not Found',
        notFoundDesc: 'Game not found. The game may have been deleted or the link is invalid.',
        backHome: '← Back to Home',
        ratingsCount: '{{count}} ratings',
        playable: '● Playable',
        by: 'by',
        playNow: 'Play Now',
        notAvailable: 'Not Available',
        openNewTab: 'Open in new tab',
        intro: 'Introduction',
        information: 'Information',
        review: {
          updateTitle: 'Update Review',
          writeTitle: 'Write a Review',
          reviewed: 'Reviewed',
          yourRating: 'Your Rating',
          comment: 'Comment',
          commentPlaceholder: 'Share your gameplay experience...',
          loginCommentPlaceholder: 'Log in to write a comment',
          loginToReview: 'Log in',
          loginToReviewSuffix: ' to submit a review.',
          submit: 'Submit Review',
          update: 'Update',
          submitting: 'Submitting...',
          delete: '🗑 Delete Review',
          deleting: 'Deleting...',
          loginToSubmit: 'Please log in to submit a review.',
          ratingRequired: 'Please select a rating from 1 to 5 stars.',
          commentRequired: 'Please enter a comment before submitting.',
          updated: 'Review updated!',
          submitted: 'Review submitted successfully!',
          submitFailed: 'Unable to submit review.',
          loginToDelete: 'Please log in to delete your review.',
          noReviewToDelete: 'You have no review to delete.',
          deleteConfirm: 'Are you sure you want to delete your review?',
          deleted: 'Review deleted.',
          deleteFailed: 'Unable to delete review.'
        },
        comments: {
          title: 'Comments',
          count: '({{count}} comments)',
          loadingFailed: 'Unable to load comments',
          empty: 'No comments yet. Be the first to share your thoughts!',
          previous: '← Previous',
          next: 'Next →',
          you: 'You'
        },
        sort: {
          newest: 'Newest',
          oldest: 'Oldest',
          highest: 'Highest Rating',
          lowest: 'Lowest Rating'
        },
        sidebar: {
          rating: 'Rating',
          quickInfo: 'Quick Info',
          category: 'Category',
          difficulty: 'Difficulty',
          players: 'Players',
          controls: 'Controls',
          status: 'Status',
          online: '● Online',
          offline: '○ Offline',
          tags: 'Tags'
        },
        infoLabels: {
          publisher: 'Publisher',
          players: 'Players',
          controls: 'Controls',
          version: 'Version',
          category: 'Category',
          difficulty: 'Difficulty',
          added: 'Added'
        },
        anonymous: 'Anonymous',
        loadError: 'Unable to load game details',
        rateAria: 'Rate {{star}} stars',
        relativeTime: {
          justNow: 'just now',
          minutesAgo: '{{count}}m ago',
          hoursAgo: '{{count}}h ago',
          daysAgo: '{{count}}d ago'
        }
      }
    }
  },
  vi: {
    translation: {
      nav: {
        home: 'Trang chủ',
        addGame: '+ Thêm',
        admin: 'Quản trị',
        login: 'Đăng nhập',
        language: 'Ngôn ngữ'
      },
      admin: {
        tabs: {
          games: 'Trò chơi',
          users: 'Người dùng',
          logs: 'Nhật ký'
        },
        showTrash: 'Hiện thùng rác',
        hideTrash: 'Ẩn thùng rác',
        restore: 'Khôi phục',
        trashed: 'ĐÃ XÓA',
        loading: 'Đang tải dữ liệu quản trị...',
        logsEmpty: 'Chưa có nhật ký',
        logsLoading: 'Đang tải nhật ký...'
      },
      addGame: {
        loading: 'Đang tải...',
        pageTitle: 'Thêm game của bạn',
        errors: {
          required: 'Vui lòng nhập tên game và URL hợp lệ.',
          invalidUrl: 'URL game không hợp lệ.',
          submitFailed: 'Không thể thêm game. Vui lòng kiểm tra đăng nhập và URL.'
        },
        fields: {
          title: 'Tên game *',
          gameUrl: 'URL game (liên kết nhúng) *',
          gameUrlHelp: 'Hãy đảm bảo URL cho phép nhúng (iframe). Itch.io, Newgrounds hoặc link HTML5 trực tiếp sẽ hoạt động tốt nhất.',
          description: 'Mô tả',
          imageUrl: 'URL ảnh thumbnail',
          tags: 'Tags (phân tách bằng dấu phẩy)',
          quickTags: 'Chọn nhanh thẻ có sẵn',
          selectedTags: 'Thẻ đã chọn',
          publisher: 'Nhà phát hành',
          players: 'Người chơi',
          controls: 'Điều khiển',
          difficulty: 'Độ khó'
        },
        placeholders: {
          title: 'VD: Super Mario Clone',
          gameUrl: 'VD: https://itch.io/embed-upload/...',
          description: 'Mô tả ngắn về game...',
          imageUrl: 'https://...',
          tags: 'Hành động, Giải đố, Retro',
          publisher: 'VD: Indie Studio',
          players: 'VD: 1 người chơi, nhiều người chơi',
          controls: 'VD: Bàn phím, Chuột'
        },
        actions: {
          cancel: 'Hủy',
          add: 'Thêm game',
          adding: 'Đang thêm...'
        },
        states: {
          noExistingTags: 'Chưa có thẻ nào sẵn có.'
        }
      },
      home: {
        alerts: {
          loginToFavorite: 'Vui lòng đăng nhập để thêm yêu thích!'
        },
        hero: {
          version: 'v1.0.0 • TRUY CẬP BETA',
          titleTop: 'THẾ HỆ MỚI',
          titleBottom: 'GAME TRÌNH DUYỆT',
          subtitleLine1: 'Không cần tải xuống. Không cần màn hình chờ.',
          subtitleLine2: 'Truy cập tức thì các game web được tuyển chọn, hiệu năng cao.',
          startPlaying: 'BẮT ĐẦU CHƠI',
          github: 'GITHUB',
          scrollToExplore: 'Cuộn để khám phá'
        },
        section: {
          trending: 'THỊNH HÀNH',
          games: 'TRÒ CHƠI',
          mostPlayed: 'ĐƯỢC CHƠI NHIỀU NHẤT TUẦN NÀY'
        },
        search: {
          console: 'Bảng tìm kiếm',
          title: 'Tìm theo tên & bộ thẻ',
          resetAll: 'Xóa tất cả ×',
          tip: 'Mẹo: Kết hợp tên + thẻ để có kết quả tốt hơn',
          placeholder: 'Tìm tên game...',
          button: 'Tìm',
          active: 'Đang áp dụng',
          matchAll: 'Khớp tất cả',
          matchAny: 'Khớp bất kỳ',
          matchAnyHelp: 'Chọn ít nhất 2 thẻ để dùng chế độ Khớp bất kỳ.',
          currentMode: 'Chế độ hiện tại: {{mode}}',
          quickTags: 'Thẻ nhanh',
          allTag: '#all'
        },
        states: {
          loadingGames: 'Đang tải game...',
          noMatch: 'Không có game nào khớp bộ lọc hiện tại.',
          clearFilters: 'Xóa toàn bộ bộ lọc',
          noGames: 'Không tìm thấy game nhúng.',
          addGameHint: 'Hãy thêm game có URL nhúng để bắt đầu chơi.'
        },
        summary: {
          name: 'TÊN: "{{query}}"',
          singleTag: 'THẺ: #{{tag}}',
          multiTag: '{{mode}} TRONG {{count}} THẺ'
        },
        noResults: {
          name: 'tên "{{query}}"',
          tags: '{{mode}} thẻ: {{tags}}'
        }
      },
      gameDetail: {
        loading: 'Đang tải chi tiết game...',
        notFoundTitle: 'Không tìm thấy game',
        notFoundDesc: 'Không tìm thấy game. Game có thể đã bị xóa hoặc liên kết không hợp lệ.',
        backHome: '← Về trang chủ',
        ratingsCount: '{{count}} lượt đánh giá',
        playable: '● Có thể chơi',
        by: 'bởi',
        playNow: 'Chơi ngay',
        notAvailable: 'Không khả dụng',
        openNewTab: 'Mở ở tab mới',
        intro: 'Giới thiệu',
        information: 'Thông tin',
        review: {
          updateTitle: 'Cập nhật đánh giá',
          writeTitle: 'Viết đánh giá',
          reviewed: 'Đã đánh giá',
          yourRating: 'Đánh giá của bạn',
          comment: 'Bình luận',
          commentPlaceholder: 'Chia sẻ trải nghiệm chơi game của bạn...',
          loginCommentPlaceholder: 'Đăng nhập để viết bình luận',
          loginToReview: 'Đăng nhập',
          loginToReviewSuffix: ' để gửi đánh giá.',
          submit: 'Gửi đánh giá',
          update: 'Cập nhật',
          submitting: 'Đang gửi...',
          delete: '🗑 Xóa đánh giá',
          deleting: 'Đang xóa...',
          loginToSubmit: 'Vui lòng đăng nhập để gửi đánh giá.',
          ratingRequired: 'Vui lòng chọn số sao từ 1 đến 5.',
          commentRequired: 'Vui lòng nhập bình luận trước khi gửi.',
          updated: 'Đã cập nhật đánh giá!',
          submitted: 'Gửi đánh giá thành công!',
          submitFailed: 'Không thể gửi đánh giá.',
          loginToDelete: 'Vui lòng đăng nhập để xóa đánh giá của bạn.',
          noReviewToDelete: 'Bạn chưa có đánh giá để xóa.',
          deleteConfirm: 'Bạn có chắc muốn xóa đánh giá của mình không?',
          deleted: 'Đã xóa đánh giá.',
          deleteFailed: 'Không thể xóa đánh giá.'
        },
        comments: {
          title: 'Bình luận',
          count: '({{count}} bình luận)',
          loadingFailed: 'Không thể tải bình luận',
          empty: 'Chưa có bình luận nào. Hãy là người đầu tiên chia sẻ cảm nhận!',
          previous: '← Trước',
          next: 'Tiếp →',
          you: 'Bạn'
        },
        sort: {
          newest: 'Mới nhất',
          oldest: 'Cũ nhất',
          highest: 'Điểm cao nhất',
          lowest: 'Điểm thấp nhất'
        },
        sidebar: {
          rating: 'Đánh giá',
          quickInfo: 'Thông tin nhanh',
          category: 'Thể loại',
          difficulty: 'Độ khó',
          players: 'Người chơi',
          controls: 'Điều khiển',
          status: 'Trạng thái',
          online: '● Trực tuyến',
          offline: '○ Ngoại tuyến',
          tags: 'Thẻ'
        },
        infoLabels: {
          publisher: 'Nhà phát hành',
          players: 'Người chơi',
          controls: 'Điều khiển',
          version: 'Phiên bản',
          category: 'Thể loại',
          difficulty: 'Độ khó',
          added: 'Ngày thêm'
        },
        anonymous: 'Ẩn danh',
        loadError: 'Không thể tải chi tiết game',
        rateAria: 'Đánh giá {{star}} sao',
        relativeTime: {
          justNow: 'vừa xong',
          minutesAgo: '{{count}}p trước',
          hoursAgo: '{{count}}g trước',
          daysAgo: '{{count}}n trước'
        }
      }
    }
  }
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: localStorage.getItem('lang') || 'en',
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
