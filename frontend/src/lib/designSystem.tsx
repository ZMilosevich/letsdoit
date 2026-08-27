import type { ReactNode } from 'react';
import { Activity } from 'lucide-react';
import { Link } from 'react-router-dom';

type ProductBrandProps = {
  to: string;
  className?: string;
};

export function ProductBrand({ to, className = '' }: ProductBrandProps) {
  return (
    <Link to={to} className={`product-brand ${className}`.trim()}>
      <span className="product-brand-mark" aria-hidden="true"><Activity size={19}/></span>
      <span className="product-brand-label">LetsDoIt</span>
    </Link>
  );
}

type PageHeadingProps = {
  eyebrow: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function PageHeading({ eyebrow, title, description, action, className = '' }: PageHeadingProps) {
  return (
    <header className={`ds-page-heading ${className}`.trim()}>
      <div className="ds-page-heading-copy">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {description && <p className="ds-page-description">{description}</p>}
      </div>
      {action && <div className="ds-page-heading-action">{action}</div>}
    </header>
  );
}
