import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../services/db';

export default function JobCardList() {
  const [jobCards, setJobCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadJobCards();

    const unsubscribe = db.onSyncEvent((type) => {
      if (type === 'change') {
        loadJobCards();
      }
    });

    return () => unsubscribe();
  }, []);

  const loadJobCards = async () => {
    try {
      const cards = await db.getAllJobCards();
      setJobCards(cards.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
    } catch (err) {
      console.error('Failed to load job cards:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this job card?')) return;

    try {
      await db.deleteJobCard(id);
      await loadJobCards();
    } catch (err) {
      console.error('Failed to delete job card:', err);
      alert('Failed to delete job card');
    }
  };

  const filteredCards = jobCards.filter((card) => {
    const matchesFilter = filter === 'all' || card.status === filter;
    const matchesSearch =
      !search ||
      card.title?.toLowerCase().includes(search.toLowerCase()) ||
      card.customer?.name?.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  if (loading) {
    return <div className="loading">Loading job cards...</div>;
  }

  return (
    <div className="jobcard-list">
      <div className="page-header">
        <h1>Job Cards</h1>
        <Link to="/jobcards/new" className="btn btn-primary">
          + New Job Card
        </Link>
      </div>

      <div className="filters">
        <input
          type="text"
          placeholder="Search by title or customer..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="search-input"
        />
        <div className="filter-buttons">
          {['all', 'pending', 'in-progress', 'completed', 'cancelled'].map((status) => (
            <button
              key={status}
              className={`btn btn-sm ${filter === status ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilter(status)}
            >
              {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {filteredCards.length === 0 ? (
            <p style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              No job cards found.
            </p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCards.map((card) => (
                  <tr key={card._id}>
                    <td>
                      <Link to={`/jobcards/${card._id}`}>
                        <strong>{card.title}</strong>
                      </Link>
                      {card.description && (
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                          {card.description.substring(0, 100)}
                          {card.description.length > 100 ? '...' : ''}
                        </p>
                      )}
                    </td>
                    <td>{card.customer?.name || '-'}</td>
                    <td>
                      <span className={`badge badge-${card.status}`}>{card.status}</span>
                    </td>
                    <td>{new Date(card.createdAt).toLocaleDateString()}</td>
                    <td>{new Date(card.updatedAt).toLocaleDateString()}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <Link to={`/jobcards/${card._id}`} className="btn btn-secondary btn-sm">
                          Edit
                        </Link>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDelete(card._id)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <style>{`
        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
        }

        .page-header h1 {
          font-size: 1.5rem;
          font-weight: 600;
        }

        .filters {
          display: flex;
          gap: 1rem;
          margin-bottom: 1.5rem;
          flex-wrap: wrap;
        }

        .search-input {
          flex: 1;
          min-width: 250px;
          padding: 0.625rem 0.875rem;
          border: 1px solid var(--border-color);
          border-radius: 0.5rem;
          font-size: 0.875rem;
        }

        .search-input:focus {
          outline: none;
          border-color: var(--primary-color);
        }

        .filter-buttons {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
      `}</style>
    </div>
  );
}
