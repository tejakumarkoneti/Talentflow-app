import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import { Search, Plus, Edit2, Archive, ArchiveRestore, GripVertical, Users, Briefcase, FileText, X, ChevronDown, ChevronUp, Save, Trash2, Eye, ArrowLeft, Clock, CheckCircle, AlertCircle, Filter, Loader } from 'lucide-react';

// ============================================================================
// DATABASE & MOCK API LAYER
// ============================================================================

// IndexedDB wrapper using native API
class Database {
  constructor() {
    this.dbName = 'talentflow';
    this.version = 1;
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        if (!db.objectStoreNames.contains('jobs')) {
          db.createObjectStore('jobs', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('candidates')) {
          db.createObjectStore('candidates', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('assessments')) {
          db.createObjectStore('assessments', { keyPath: 'jobId' });
        }
        if (!db.objectStoreNames.contains('timelines')) {
          db.createObjectStore('timelines', { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains('responses')) {
          db.createObjectStore('responses', { keyPath: 'id' });
        }
      };
    });
  }

  async getAll(storeName) {
    const tx = this.db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async get(storeName, key) {
    const tx = this.db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    return new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async put(storeName, value) {
    const tx = this.db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    return new Promise((resolve, reject) => {
      const request = store.put(value);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async delete(storeName, key) {
    const tx = this.db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    return new Promise((resolve, reject) => {
      const request = store.delete(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async clear(storeName) {
    const tx = this.db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    return new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}

const db = new Database();

// Mock API with artificial latency and error injection
const mockAPI = {
  async delay() {
    const ms = Math.random() * 1000 + 200;
    await new Promise(resolve => setTimeout(resolve, ms));
  },
  
  shouldError() {
    return Math.random() < 0.08;
  },
  
  async getJobs(params = {}) {
    await this.delay();
    let jobs = await db.getAll('jobs');
    
    // Filter
    if (params.search) {
      const search = params.search.toLowerCase();
      jobs = jobs.filter(j => j.title.toLowerCase().includes(search));
    }
    if (params.status) {
      jobs = jobs.filter(j => j.status === params.status);
    }
    if (params.tag) {
      jobs = jobs.filter(j => j.tags.includes(params.tag));
    }
    
    // Sort
    jobs.sort((a, b) => a.order - b.order);
    
    // Paginate
    const page = parseInt(params.page) || 1;
    const pageSize = parseInt(params.pageSize) || 10;
    const start = (page - 1) * pageSize;
    const paginatedJobs = jobs.slice(start, start + pageSize);
    
    return {
      data: paginatedJobs,
      total: jobs.length,
      page,
      pageSize,
      totalPages: Math.ceil(jobs.length / pageSize)
    };
  },
  
  async createJob(job) {
    await this.delay();
    if (this.shouldError()) throw new Error('Failed to create job');
    
    const newJob = {
      ...job,
      id: Date.now().toString(),
      createdAt: new Date().toISOString()
    };
    await db.put('jobs', newJob);
    return newJob;
  },
  
  async updateJob(id, updates) {
    await this.delay();
    if (this.shouldError()) throw new Error('Failed to update job');
    
    const job = await db.get('jobs', id);
    const updated = { ...job, ...updates };
    await db.put('jobs', updated);
    return updated;
  },
  
  async reorderJob(id, fromOrder, toOrder) {
    await this.delay();
    if (this.shouldError()) throw new Error('Reorder failed');
    
    const jobs = await db.getAll('jobs');
    const job = jobs.find(j => j.id === id);
    
    if (fromOrder < toOrder) {
      jobs.forEach(j => {
        if (j.order > fromOrder && j.order <= toOrder) j.order--;
      });
    } else {
      jobs.forEach(j => {
        if (j.order >= toOrder && j.order < fromOrder) j.order++;
      });
    }
    
    job.order = toOrder;
    
    for (const j of jobs) {
      await db.put('jobs', j);
    }
    
    return job;
  },
  
  async getCandidates(params = {}) {
    await this.delay();
    let candidates = await db.getAll('candidates');
    
    // Filter
    if (params.search) {
      const search = params.search.toLowerCase();
      candidates = candidates.filter(c => 
        c.name.toLowerCase().includes(search) || 
        c.email.toLowerCase().includes(search)
      );
    }
    if (params.stage) {
      candidates = candidates.filter(c => c.stage === params.stage);
    }
    if (params.jobId) {
      candidates = candidates.filter(c => c.jobId === params.jobId);
    }
    
    const page = parseInt(params.page) || 1;
    const pageSize = parseInt(params.pageSize) || 50;
    const start = (page - 1) * pageSize;
    
    return {
      data: candidates.slice(start, start + pageSize),
      total: candidates.length,
      page,
      pageSize
    };
  },
  
  async updateCandidate(id, updates) {
    await this.delay();
    if (this.shouldError()) throw new Error('Failed to update candidate');
    
    const candidate = await db.get('candidates', id);
    const updated = { ...candidate, ...updates };
    await db.put('candidates', updated);
    
    // Add timeline entry
    if (updates.stage && updates.stage !== candidate.stage) {
      await db.put('timelines', {
        candidateId: id,
        stage: updates.stage,
        timestamp: new Date().toISOString(),
        note: updates.note || `Moved to ${updates.stage}`
      });
    }
    
    return updated;
  },
  
  async getTimeline(candidateId) {
    await this.delay();
    const timelines = await db.getAll('timelines');
    return timelines.filter(t => t.candidateId === candidateId)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  },
  
  async getAssessment(jobId) {
    await this.delay();
    return await db.get('assessments', jobId);
  },
  
  async saveAssessment(jobId, assessment) {
    await this.delay();
    if (this.shouldError()) throw new Error('Failed to save assessment');
    
    await db.put('assessments', { jobId, ...assessment });
    return assessment;
  }
};

// Seed data generator
const seedData = async () => {
  const jobs = await db.getAll('jobs');
  if (jobs.length > 0) return;
  
  const jobTitles = [
    'Senior Frontend Developer', 'Backend Engineer', 'Full Stack Developer',
    'DevOps Engineer', 'Data Scientist', 'Product Manager', 'UX Designer',
    'Mobile Developer', 'QA Engineer', 'Technical Writer', 'Sales Manager',
    'Marketing Specialist', 'HR Manager', 'Finance Analyst', 'Operations Lead',
    'Customer Success Manager', 'Security Engineer', 'Cloud Architect',
    'Machine Learning Engineer', 'Business Analyst', 'Scrum Master',
    'Systems Administrator', 'Network Engineer', 'Database Administrator', 'Solutions Architect'
  ];
  
  const tags = ['Remote', 'Full-time', 'Part-time', 'Contract', 'Senior', 'Junior', 'Mid-level'];
  const stages = ['applied', 'screen', 'tech', 'offer', 'hired', 'rejected'];
  
  // Create jobs
  for (let i = 0; i < 25; i++) {
    const job = {
      id: `job-${i + 1}`,
      title: jobTitles[i],
      slug: jobTitles[i].toLowerCase().replace(/\s+/g, '-'),
      status: i < 18 ? 'active' : 'archived',
      tags: [tags[i % tags.length], tags[(i + 1) % tags.length]],
      order: i,
      description: `Great opportunity for ${jobTitles[i]}`,
      createdAt: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000).toISOString()
    };
    await db.put('jobs', job);
  }
  
  // Create candidates
  const firstNames = ['John', 'Jane', 'Alex', 'Sarah', 'Mike', 'Emma', 'Chris', 'Lisa', 'David', 'Anna'];
  const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez'];
  
  for (let i = 0; i < 1000; i++) {
    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
    const candidate = {
      id: `candidate-${i + 1}`,
      name: `${firstName} ${lastName}`,
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@example.com`,
      jobId: `job-${Math.floor(Math.random() * 25) + 1}`,
      stage: stages[Math.floor(Math.random() * stages.length)],
      appliedAt: new Date(Date.now() - Math.random() * 60 * 24 * 60 * 60 * 1000).toISOString(),
      notes: []
    };
    await db.put('candidates', candidate);
    
    // Add initial timeline
    await db.put('timelines', {
      candidateId: candidate.id,
      stage: 'applied',
      timestamp: candidate.appliedAt,
      note: 'Application submitted'
    });
  }
  
  // Create sample assessments
  const questionTypes = ['single', 'multi', 'short', 'long', 'number', 'file'];
  for (let i = 1; i <= 3; i++) {
    const sections = [];
    for (let s = 0; s < 3; s++) {
      const questions = [];
      for (let q = 0; q < 5; q++) {
        const type = questionTypes[Math.floor(Math.random() * questionTypes.length)];
        questions.push({
          id: `q-${s}-${q}`,
          type,
          question: `Question ${q + 1} in Section ${s + 1}`,
          required: Math.random() > 0.3,
          options: type === 'single' || type === 'multi' ? ['Option A', 'Option B', 'Option C', 'Option D'] : undefined,
          min: type === 'number' ? 0 : undefined,
          max: type === 'number' ? 100 : undefined,
          maxLength: type === 'short' ? 100 : type === 'long' ? 1000 : undefined,
          conditional: q === 2 ? { questionId: `q-${s}-0`, value: 'Option A' } : undefined
        });
      }
      sections.push({
        id: `section-${s}`,
        title: `Section ${s + 1}`,
        questions
      });
    }
    
    await db.put('assessments', {
      jobId: `job-${i}`,
      sections
    });
  }
};

// ============================================================================
// COMPONENTS
// ============================================================================

const TalentFlow = () => {
  const [view, setView] = useState('jobs');
  const [selectedJob, setSelectedJob] = useState(null);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const init = async () => {
      await db.init();
      await seedData();
      setIsInitialized(true);
    };
    init();
  }, []);

  if (!isInitialized) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <Loader className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Initializing TalentFlow...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-8">
              <h1 className="text-xl font-bold text-blue-600">TalentFlow</h1>
              <div className="flex space-x-4">
                <button
                  onClick={() => { setView('jobs'); setSelectedJob(null); setSelectedCandidate(null); }}
                  className={`flex items-center space-x-2 px-3 py-2 rounded ${view === 'jobs' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'}`}
                >
                  <Briefcase className="w-4 h-4" />
                  <span>Jobs</span>
                </button>
                <button
                  onClick={() => { setView('candidates'); setSelectedJob(null); setSelectedCandidate(null); }}
                  className={`flex items-center space-x-2 px-3 py-2 rounded ${view === 'candidates' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'}`}
                >
                  <Users className="w-4 h-4" />
                  <span>Candidates</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {selectedCandidate ? (
          <CandidateProfile 
            candidateId={selectedCandidate} 
            onBack={() => setSelectedCandidate(null)} 
          />
        ) : selectedJob && view === 'jobs' ? (
          <JobDetail 
            jobId={selectedJob} 
            onBack={() => setSelectedJob(null)}
            onViewAssessment={() => setView('assessment')}
          />
        ) : view === 'jobs' ? (
          <JobsBoard onSelectJob={setSelectedJob} />
        ) : view === 'candidates' ? (
          <CandidatesView onSelectCandidate={setSelectedCandidate} />
        ) : view === 'assessment' ? (
          <AssessmentBuilder 
            jobId={selectedJob} 
            onBack={() => setView('jobs')}
          />
        ) : null}
      </main>
    </div>
  );
};

// Jobs Board Component
const JobsBoard = ({ onSelectJob }) => {
  const [jobs, setJobs] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingJob, setEditingJob] = useState(null);
  const [allTags, setAllTags] = useState([]);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const result = await mockAPI.getJobs({ search, status: statusFilter, tag: tagFilter, page, pageSize: 10 });
      setJobs(result.data);
      setTotalPages(result.totalPages);
      
      // Get all tags
      const allJobs = await db.getAll('jobs');
      const tags = [...new Set(allJobs.flatMap(j => j.tags))];
      setAllTags(tags);
    } catch (error) {
      console.error('Failed to load jobs:', error);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, tagFilter, page]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const handleDragEnd = async (result) => {
    if (!result.destination) return;
    
    const items = Array.from(jobs);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    
    // Optimistic update
    setJobs(items);
    
    try {
      await mockAPI.reorderJob(
        reorderedItem.id,
        result.source.index,
        result.destination.index
      );
    } catch (error) {
      // Rollback on failure
      console.error('Reorder failed, rolling back:', error);
      loadJobs();
    }
  };

  const handleArchive = async (job) => {
    try {
      await mockAPI.updateJob(job.id, { status: job.status === 'active' ? 'archived' : 'active' });
      loadJobs();
    } catch (error) {
      console.error('Failed to archive job:', error);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Jobs</h2>
        <button
          onClick={() => { setEditingJob(null); setShowModal(true); }}
          className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          <span>Create Job</span>
        </button>
      </div>

      <div className="bg-white rounded-lg shadow mb-6 p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <input
              type="text"
              placeholder="Search jobs..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 border border-gray-300 rounded"
            />
          </div>
          <div>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 border border-gray-300 rounded"
            >
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <div>
            <select
              value={tagFilter}
              onChange={(e) => { setTagFilter(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 border border-gray-300 rounded"
            >
              <option value="">All Tags</option>
              {allTags.map(tag => (
                <option key={tag} value={tag}>{tag}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      ) : (
        <>
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="jobs">
              {(provided) => (
                <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-3">
                  {jobs.map((job, index) => (
                    <Draggable key={job.id} draggableId={job.id} index={index}>
                      {(provided) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className="bg-white rounded-lg shadow p-4 flex items-center space-x-4"
                        >
                          <div {...provided.dragHandleProps}>
                            <GripVertical className="w-5 h-5 text-gray-400" />
                          </div>
                          <div className="flex-1 cursor-pointer" onClick={() => onSelectJob(job.id)}>
                            <h3 className="font-semibold text-gray-900">{job.title}</h3>
                            <div className="flex items-center space-x-2 mt-1">
                              <span className={`text-xs px-2 py-1 rounded ${job.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                                {job.status}
                              </span>
                              {job.tags.map(tag => (
                                <span key={tag} className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>
                          <button
                            onClick={() => { setEditingJob(job); setShowModal(true); }}
                            className="p-2 text-gray-600 hover:bg-gray-100 rounded"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleArchive(job)}
                            className="p-2 text-gray-600 hover:bg-gray-100 rounded"
                          >
                            {job.status === 'active' ? <Archive className="w-4 h-4" /> : <ArchiveRestore className="w-4 h-4" />}
                          </button>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>

          <div className="flex justify-center items-center space-x-4 mt-6">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 border rounded disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-gray-600">Page {page} of {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-4 py-2 border rounded disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </>
      )}

      {showModal && (
        <JobModal
          job={editingJob}
          onClose={() => setShowModal(false)}
          onSave={loadJobs}
        />
      )}
    </div>
  );
};

// Job Modal Component
const JobModal = ({ job, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    title: job?.title || '',
    slug: job?.slug || '',
    status: job?.status || 'active',
    tags: job?.tags?.join(', ') || '',
    description: job?.description || ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (!formData.title.trim()) {
        throw new Error('Title is required');
      }

      const slug = formData.slug || formData.title.toLowerCase().replace(/\s+/g, '-');
      const allJobs = await db.getAll('jobs');
      
      if (allJobs.some(j => j.slug === slug && j.id !== job?.id)) {
        throw new Error('Slug must be unique');
      }

      const jobData = {
        ...formData,
        slug,
        tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean),
        order: job?.order ?? allJobs.length
      };

      if (job) {
        await mockAPI.updateJob(job.id, jobData);
      } else {
        await mockAPI.createJob(jobData);
      }

      onSave();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">{job ? 'Edit Job' : 'Create Job'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
            <input
              type="text"
              value={formData.slug}
              onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded"
              placeholder="auto-generated-from-title"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded"
            >
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tags (comma-separated)</label>
            <input
              type="text"
              value={formData.tags}
              onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded"
              placeholder="Remote, Full-time"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded"
              rows="3"
            />
          </div>

          {error && (
            <div className="bg-red-50 text-red-700 p-3 rounded">{error}</div>
          )}

          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Job Detail Component
const JobDetail = ({ jobId, onBack, onViewAssessment }) => {
  const [job, setJob] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const jobData = await db.get('jobs', jobId);
        setJob(jobData);
        const candidatesData = await mockAPI.getCandidates({ jobId, pageSize: 100 });
        setCandidates(candidatesData.data);
      } catch (error) {
        console.error('Failed to load job:', error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [jobId]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!job) return null;

  const stageCounts = candidates.reduce((acc, c) => {
    acc[c.stage] = (acc[c.stage] || 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      <button
        onClick={onBack}
        className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Jobs</span>
      </button>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{job.title}</h2>
            <p className="text-gray-600 mt-1">/{job.slug}</p>
          </div>
          <div className="flex space-x-2">
            <span className={`px-3 py-1 rounded text-sm ${job.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
              {job.status}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {job.tags.map(tag => (
            <span key={tag} className="px-3 py-1 rounded text-sm bg-blue-100 text-blue-700">
              {tag}
            </span>
          ))}
        </div>

        <p className="text-gray-700 mb-6">{job.description}</p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gray-50 p-4 rounded">
            <div className="text-2xl font-bold text-gray-900">{candidates.length}</div>
            <div className="text-sm text-gray-600">Total Applicants</div>
          </div>
          <div className="bg-blue-50 p-4 rounded">
            <div className="text-2xl font-bold text-blue-600">{stageCounts.applied || 0}</div>
            <div className="text-sm text-gray-600">Applied</div>
          </div>
          <div className="bg-yellow-50 p-4 rounded">
            <div className="text-2xl font-bold text-yellow-600">{stageCounts.screen || 0}</div>
            <div className="text-sm text-gray-600">In Review</div>
          </div>
          <div className="bg-green-50 p-4 rounded">
            <div className="text-2xl font-bold text-green-600">{stageCounts.hired || 0}</div>
            <div className="text-sm text-gray-600">Hired</div>
          </div>
        </div>

        <button
          onClick={onViewAssessment}
          className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          <FileText className="w-4 h-4" />
          <span>Manage Assessment</span>
        </button>
      </div>

      <KanbanBoard jobId={jobId} />
    </div>
  );
};

// Kanban Board Component
const KanbanBoard = ({ jobId }) => {
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);

  const stages = [
    { id: 'applied', label: 'Applied', color: 'bg-gray-100' },
    { id: 'screen', label: 'Screening', color: 'bg-blue-100' },
    { id: 'tech', label: 'Technical', color: 'bg-purple-100' },
    { id: 'offer', label: 'Offer', color: 'bg-yellow-100' },
    { id: 'hired', label: 'Hired', color: 'bg-green-100' },
    { id: 'rejected', label: 'Rejected', color: 'bg-red-100' }
  ];

  const loadCandidates = async () => {
    setLoading(true);
    try {
      const result = await mockAPI.getCandidates({ jobId, pageSize: 1000 });
      setCandidates(result.data);
    } catch (error) {
      console.error('Failed to load candidates:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCandidates();
  }, [jobId]);

  const handleDragEnd = async (result) => {
    if (!result.destination) return;
    
    const candidateId = result.draggableId;
    const newStage = result.destination.droppableId;
    
    // Optimistic update
    setCandidates(prev => prev.map(c => 
      c.id === candidateId ? { ...c, stage: newStage } : c
    ));
    
    try {
      await mockAPI.updateCandidate(candidateId, { stage: newStage });
    } catch (error) {
      console.error('Failed to update candidate:', error);
      loadCandidates();
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">Pipeline</h3>
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-6 gap-4">
          {stages.map(stage => {
            const stageCandidates = candidates.filter(c => c.stage === stage.id);
            return (
              <div key={stage.id} className={`${stage.color} rounded-lg p-3`}>
                <div className="font-medium text-sm mb-3">
                  {stage.label} ({stageCandidates.length})
                </div>
                <Droppable droppableId={stage.id}>
                  {(provided) => (
                    <div
                      {...provided.droppableProps}
                      ref={provided.innerRef}
                      className="space-y-2 min-h-[200px]"
                    >
                      {stageCandidates.map((candidate, index) => (
                        <Draggable key={candidate.id} draggableId={candidate.id} index={index}>
                          {(provided) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              className="bg-white p-2 rounded shadow-sm text-xs"
                            >
                              <div className="font-medium truncate">{candidate.name}</div>
                              <div className="text-gray-500 truncate">{candidate.email}</div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </DragDropContext>
    </div>
  );
};

// Candidates View Component
const CandidatesView = ({ onSelectCandidate }) => {
  const [candidates, setCandidates] = useState([]);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 50 });
  const containerRef = useRef(null);

  const stages = ['applied', 'screen', 'tech', 'offer', 'hired', 'rejected'];

  const loadCandidates = useCallback(async () => {
    setLoading(true);
    try {
      const result = await mockAPI.getCandidates({ 
        search, 
        stage: stageFilter, 
        pageSize: 1000 
      });
      setCandidates(result.data);
    } catch (error) {
      console.error('Failed to load candidates:', error);
    } finally {
      setLoading(false);
    }
  }, [search, stageFilter]);

  useEffect(() => {
    loadCandidates();
  }, [loadCandidates]);

  // Virtual scrolling
  useEffect(() => {
    const handleScroll = () => {
      if (!containerRef.current) return;
      const scrollTop = containerRef.current.scrollTop;
      const itemHeight = 72;
      const start = Math.floor(scrollTop / itemHeight);
      const end = start + 50;
      setVisibleRange({ start, end });
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, []);

  const visibleCandidates = candidates.slice(visibleRange.start, visibleRange.end);
  const totalHeight = candidates.length * 72;
  const offsetY = visibleRange.start * 72;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Candidates</h2>
      </div>

      <div className="bg-white rounded-lg shadow mb-6 p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <input
              type="text"
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded"
            />
          </div>
          <div>
            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded"
            >
              <option value="">All Stages</option>
              {stages.map(stage => (
                <option key={stage} value={stage}>{stage}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b">
            <p className="text-sm text-gray-600">
              Showing {candidates.length} candidates (virtualized scrolling)
            </p>
          </div>
          <div
            ref={containerRef}
            className="overflow-y-auto"
            style={{ height: '600px' }}
          >
            <div style={{ height: `${totalHeight}px`, position: 'relative' }}>
              <div style={{ transform: `translateY(${offsetY}px)` }}>
                {visibleCandidates.map((candidate) => (
                  <div
                    key={candidate.id}
                    onClick={() => onSelectCandidate(candidate.id)}
                    className="flex items-center justify-between p-4 border-b hover:bg-gray-50 cursor-pointer"
                    style={{ height: '72px' }}
                  >
                    <div>
                      <h3 className="font-semibold text-gray-900">{candidate.name}</h3>
                      <p className="text-sm text-gray-600">{candidate.email}</p>
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700">
                        {candidate.stage}
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(candidate.appliedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Candidate Profile Component
const CandidateProfile = ({ candidateId, onBack }) => {
  const [candidate, setCandidate] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const candidateData = await db.get('candidates', candidateId);
        setCandidate(candidateData);
        const timelineData = await mockAPI.getTimeline(candidateId);
        setTimeline(timelineData);
        const jobData = await db.get('jobs', candidateData.jobId);
        setJob(jobData);
      } catch (error) {
        console.error('Failed to load candidate:', error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [candidateId]);

  const handleAddNote = async () => {
    if (!note.trim()) return;
    
    try {
      await db.put('timelines', {
        candidateId,
        stage: candidate.stage,
        timestamp: new Date().toISOString(),
        note: note,
        type: 'note'
      });
      
      const timelineData = await mockAPI.getTimeline(candidateId);
      setTimeline(timelineData);
      setNote('');
    } catch (error) {
      console.error('Failed to add note:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!candidate) return null;

  return (
    <div>
      <button
        onClick={onBack}
        className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Candidates</span>
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">{candidate.name}</h2>
            <p className="text-gray-600 mb-4">{candidate.email}</p>
            
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <span className="text-sm text-gray-600">Applied to:</span>
                <p className="font-medium">{job?.title}</p>
              </div>
              <div>
                <span className="text-sm text-gray-600">Current Stage:</span>
                <p className="font-medium capitalize">{candidate.stage}</p>
              </div>
              <div>
                <span className="text-sm text-gray-600">Applied:</span>
                <p className="font-medium">
                  {new Date(candidate.appliedAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">Timeline</h3>
            <div className="space-y-4">
              {timeline.map((entry, index) => (
                <div key={index} className="flex space-x-3">
                  <div className="flex-shrink-0">
                    {entry.type === 'note' ? (
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                        <FileText className="w-4 h-4 text-blue-600" />
                      </div>
                    ) : (
                      <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{entry.note}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(entry.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">Add Note</h3>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note with @mentions..."
              className="w-full px-3 py-2 border border-gray-300 rounded mb-3"
              rows="4"
            />
            <button
              onClick={handleAddNote}
              className="w-full bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
              Add Note
            </button>
            <p className="text-xs text-gray-500 mt-2">
              Tip: Use @name to mention team members
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// Assessment Builder Component
const AssessmentBuilder = ({ jobId, onBack }) => {
  const [assessment, setAssessment] = useState({ sections: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [job, setJob] = useState(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const jobData = await db.get('jobs', jobId);
        setJob(jobData);
        const assessmentData = await mockAPI.getAssessment(jobId);
        if (assessmentData) {
          setAssessment(assessmentData);
        }
      } catch (error) {
        console.error('Failed to load assessment:', error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [jobId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await mockAPI.saveAssessment(jobId, assessment);
      alert('Assessment saved successfully!');
    } catch (error) {
      alert('Failed to save assessment: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const addSection = () => {
    setAssessment({
      ...assessment,
      sections: [
        ...assessment.sections,
        {
          id: `section-${Date.now()}`,
          title: `Section ${assessment.sections.length + 1}`,
          questions: []
        }
      ]
    });
  };

  const updateSection = (sectionId, updates) => {
    setAssessment({
      ...assessment,
      sections: assessment.sections.map(s =>
        s.id === sectionId ? { ...s, ...updates } : s
      )
    });
  };

  const deleteSection = (sectionId) => {
    setAssessment({
      ...assessment,
      sections: assessment.sections.filter(s => s.id !== sectionId)
    });
  };

  const addQuestion = (sectionId) => {
    setAssessment({
      ...assessment,
      sections: assessment.sections.map(s =>
        s.id === sectionId
          ? {
              ...s,
              questions: [
                ...s.questions,
                {
                  id: `q-${Date.now()}`,
                  type: 'short',
                  question: '',
                  required: false
                }
              ]
            }
          : s
      )
    });
  };

  const updateQuestion = (sectionId, questionId, updates) => {
    setAssessment({
      ...assessment,
      sections: assessment.sections.map(s =>
        s.id === sectionId
          ? {
              ...s,
              questions: s.questions.map(q =>
                q.id === questionId ? { ...q, ...updates } : q
              )
            }
          : s
      )
    });
  };

  const deleteQuestion = (sectionId, questionId) => {
    setAssessment({
      ...assessment,
      sections: assessment.sections.map(s =>
        s.id === sectionId
          ? {
              ...s,
              questions: s.questions.filter(q => q.id !== questionId)
            }
          : s
      )
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (previewMode) {
    return (
      <AssessmentPreview
        assessment={assessment}
        job={job}
        onClose={() => setPreviewMode(false)}
      />
    );
  }

  return (
    <div>
      <button
        onClick={onBack}
        className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Job</span>
      </button>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Assessment Builder</h2>
          <p className="text-gray-600">{job?.title}</p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={() => setPreviewMode(true)}
            className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
          >
            <Eye className="w-4 h-4" />
            <span>Preview</span>
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving...' : 'Save'}</span>
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {assessment.sections.map((section, sIndex) => (
          <div key={section.id} className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <input
                type="text"
                value={section.title}
                onChange={(e) => updateSection(section.id, { title: e.target.value })}
                className="text-lg font-semibold border-0 border-b-2 border-transparent focus:border-blue-600 focus:outline-none"
                placeholder="Section Title"
              />
              <button
                onClick={() => deleteSection(section.id)}
                className="text-red-600 hover:bg-red-50 p-2 rounded"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              {section.questions.map((question, qIndex) => (
                <QuestionEditor
                  key={question.id}
                  question={question}
                  sectionQuestions={section.questions}
                  onUpdate={(updates) => updateQuestion(section.id, question.id, updates)}
                  onDelete={() => deleteQuestion(section.id, question.id)}
                />
              ))}
            </div>

            <button
              onClick={() => addQuestion(section.id)}
              className="mt-4 flex items-center space-x-2 text-blue-600 hover:bg-blue-50 px-3 py-2 rounded"
            >
              <Plus className="w-4 h-4" />
              <span>Add Question</span>
            </button>
          </div>
        ))}

        <button
          onClick={addSection}
          className="w-full flex items-center justify-center space-x-2 border-2 border-dashed border-gray-300 rounded-lg p-6 hover:border-blue-600 hover:bg-blue-50"
        >
          <Plus className="w-5 h-5" />
          <span>Add Section</span>
        </button>
      </div>
    </div>
  );
};

// Question Editor Component
const QuestionEditor = ({ question, sectionQuestions, onUpdate, onDelete }) => {
  const questionTypes = [
    { value: 'single', label: 'Single Choice' },
    { value: 'multi', label: 'Multiple Choice' },
    { value: 'short', label: 'Short Text' },
    { value: 'long', label: 'Long Text' },
    { value: 'number', label: 'Number' },
    { value: 'file', label: 'File Upload' }
  ];

  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <div className="flex items-start space-x-4">
        <div className="flex-1 space-y-3">
          <input
            type="text"
            value={question.question}
            onChange={(e) => onUpdate({ question: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded"
            placeholder="Question text"
          />

          <div className="grid grid-cols-2 gap-3">
            <select
              value={question.type}
              onChange={(e) => onUpdate({ type: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded"
            >
              {questionTypes.map(type => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>

            <label className="flex items-center space-x-2 px-3 py-2">
              <input
                type="checkbox"
                checked={question.required}
                onChange={(e) => onUpdate({ required: e.target.checked })}
                className="rounded"
              />
              <span className="text-sm">Required</span>
            </label>
          </div>

          {(question.type === 'single' || question.type === 'multi') && (
            <textarea
              value={(question.options || []).join('\n')}
              onChange={(e) => onUpdate({ options: e.target.value.split('\n').filter(Boolean) })}
              className="w-full px-3 py-2 border border-gray-300 rounded"
              rows="3"
              placeholder="One option per line"
            />
          )}

          {question.type === 'number' && (
            <div className="grid grid-cols-2 gap-3">
              <input
                type="number"
                value={question.min || ''}
                onChange={(e) => onUpdate({ min: parseInt(e.target.value) || 0 })}
                className="px-3 py-2 border border-gray-300 rounded"
                placeholder="Min value"
              />
              <input
                type="number"
                value={question.max || ''}
                onChange={(e) => onUpdate({ max: parseInt(e.target.value) || 100 })}
                className="px-3 py-2 border border-gray-300 rounded"
                placeholder="Max value"
              />
            </div>
          )}

          {(question.type === 'short' || question.type === 'long') && (
            <input
              type="number"
              value={question.maxLength || ''}
              onChange={(e) => onUpdate({ maxLength: parseInt(e.target.value) || undefined })}
              className="px-3 py-2 border border-gray-300 rounded"
              placeholder="Max characters"
            />
          )}

          <div className="border-t pt-3">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Conditional Logic (show this question only if)
            </label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded"
              onChange={(e) => onUpdate({ 
                conditional: e.target.value ? { 
                  questionId: e.target.value, 
                  value: 'Option A' 
                } : undefined 
              })}
            >
              <option value="">None</option>
              {sectionQuestions
                .filter(q => q.id !== question.id)
                .map(q => (
                  <option key={q.id} value={q.id}>{q.question || 'Question'}</option>
                ))
              }
            </select>
          </div>

          <button
            onClick={onDelete}
            className="mt-2 text-red-600 hover:bg-red-50 px-3 py-2 rounded text-sm"
          >
            Delete Question
          </button>
        </div>
      </div>
    </div>
  );
};

// Assessment Preview Component
const AssessmentPreview = ({ assessment, job, onClose }) => {
  return (
    <div>
      <button
        onClick={onClose}
        className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Builder</span>
      </button>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">{job?.title}</h2>
        <p className="text-gray-600 mb-6">Assessment Preview</p>

        {assessment.sections.map((section, sIndex) => (
          <div key={section.id} className="mb-8">
            <h3 className="text-lg font-semibold mb-4">{section.title}</h3>
            <div className="space-y-4">
              {section.questions.map((question, qIndex) => (
                <div key={question.id} className="border border-gray-200 rounded p-4">
                  <label className="block font-medium mb-2">
                    {question.question} {question.required && <span className="text-red-500">*</span>}
                  </label>
                  
                  {question.type === 'single' && (
                    <div className="space-y-2">
                      {question.options?.map((opt, idx) => (
                        <label key={idx} className="flex items-center space-x-2">
                          <input type="radio" name={`q-${question.id}`} className="rounded" />
                          <span>{opt}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  
                  {question.type === 'multi' && (
                    <div className="space-y-2">
                      {question.options?.map((opt, idx) => (
                        <label key={idx} className="flex items-center space-x-2">
                          <input type="checkbox" className="rounded" />
                          <span>{opt}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  
                  {question.type === 'short' && (
                    <input 
                      type="text" 
                      className="w-full px-3 py-2 border rounded"
                      placeholder="Enter your answer"
                      maxLength={question.maxLength}
                    />
                  )}
                  
                  {question.type === 'long' && (
                    <textarea 
                      className="w-full px-3 py-2 border rounded"
                      placeholder="Enter your answer"
                      maxLength={question.maxLength}
                      rows="4"
                    />
                  )}
                  
                  {question.type === 'number' && (
                    <input 
                      type="number" 
                      className="w-full px-3 py-2 border rounded"
                      placeholder="Enter a number"
                      min={question.min}
                      max={question.max}
                    />
                  )}
                  
                  {question.type === 'file' && (
                    <input 
                      type="file" 
                      className="w-full px-3 py-2 border rounded"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TalentFlow;
