export default function CustomerInfoSection({ customer, handleChange }) {
  return (
    <div className="card">
      <div className="card-header">
        <h2>Customer Information</h2>
      </div>
      <div className="card-body">
        <div className="form-group">
          <label htmlFor="customer.name">Name</label>
          <input
            type="text"
            id="customer.name"
            name="customer.name"
            value={customer.name}
            onChange={handleChange}
          />
        </div>

        <div className="form-group">
          <label htmlFor="customer.phone">Phone</label>
          <input
            type="tel"
            id="customer.phone"
            name="customer.phone"
            value={customer.phone}
            onChange={handleChange}
          />
        </div>

        <div className="form-group">
          <label htmlFor="customer.email">Email</label>
          <input
            type="email"
            id="customer.email"
            name="customer.email"
            value={customer.email}
            onChange={handleChange}
          />
        </div>
      </div>
    </div>
  );
}
