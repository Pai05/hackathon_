import type { ResearchResult } from './api/research';

export const MOCK_RESULT: ResearchResult = {
  job_id: 'demo-001',
  status: 'completed',
  query: 'Machine Learning in Healthcare',
  papers: [
    {
      title: 'Deep Learning for Medical Image Analysis: A Comprehensive Survey',
      authors: 'Li, Zhang, Chen et al.',
      year: 2024,
      source: 'Nature Medicine',
      abstract: 'This survey comprehensively reviews deep learning techniques applied to medical image analysis, covering classification, segmentation, and detection tasks across radiology, pathology, and ophthalmology.',
      url: 'https://scholar.google.com/scholar?q=deep+learning+medical+image+analysis',
      key_findings: 'CNNs achieve radiologist-level accuracy in detecting diabetic retinopathy and certain cancers.',
    },
    {
      title: 'Federated Learning for Electronic Health Records: Privacy-Preserving Approaches',
      authors: 'Rieke, Hancox, Li et al.',
      year: 2023,
      source: 'IEEE JBHI',
      abstract: 'This paper explores federated learning frameworks that enable multi-institutional collaboration on EHR data without sharing raw patient information, achieving competitive performance with centralized approaches.',
      url: 'https://scholar.google.com/scholar?q=federated+learning+health+records',
      key_findings: 'Federated models achieve 94% of centralized model performance while preserving privacy.',
    },
    {
      title: 'Transformer Models for Clinical NLP: From BERT to GPT in Medicine',
      authors: 'Gu, Tinn, Cheng et al.',
      year: 2024,
      source: 'ACL Anthology',
      abstract: 'A systematic evaluation of transformer-based language models fine-tuned for clinical text understanding, including named entity recognition, relation extraction, and clinical note summarization.',
      url: 'https://scholar.google.com/scholar?q=transformer+clinical+NLP',
      key_findings: 'Domain-specific pretraining (PubMedBERT) outperforms general BERT by 8-15% on biomedical NLP benchmarks.',
    },
    {
      title: 'Reinforcement Learning for Treatment Optimization in Critical Care',
      authors: 'Komorowski, Celi, Badawi et al.',
      year: 2023,
      source: 'Nature Medicine',
      abstract: 'This study applies reinforcement learning to optimize treatment strategies for sepsis patients in ICU settings, demonstrating potential for reducing mortality through AI-guided clinical decisions.',
      url: 'https://scholar.google.com/scholar?q=reinforcement+learning+treatment+optimization',
      key_findings: 'RL policies could reduce estimated ICU mortality by 1.8-3.6% compared to clinician decisions.',
    },
    {
      title: 'Bias and Fairness in Machine Learning Models for Healthcare',
      authors: 'Obermeyer, Powers, Vogeli, Mullainathan',
      year: 2023,
      source: 'Science',
      abstract: 'An analysis of algorithmic bias in healthcare ML systems, revealing significant racial disparities in risk prediction models and proposing mitigation strategies for equitable AI deployment.',
      url: 'https://scholar.google.com/scholar?q=bias+fairness+machine+learning+healthcare',
      key_findings: 'Commercial health algorithms exhibited significant racial bias, affecting 46% of Black patients.',
    },
  ],
  key_findings: [
    { paper_title: 'Deep Learning for Medical Image Analysis', findings: 'CNNs achieve radiologist-level accuracy in detecting diabetic retinopathy, lung nodules, and skin cancer with AUC > 0.95.' },
    { paper_title: 'Federated Learning for EHR', findings: 'Privacy-preserving federated approaches achieve 94% of centralized performance while maintaining HIPAA compliance.' },
    { paper_title: 'Transformer Models for Clinical NLP', findings: 'Domain-specific pretraining improves clinical NLP tasks by 8-15% over general-purpose models.' },
    { paper_title: 'RL for Treatment Optimization', findings: 'AI-guided treatment policies could reduce ICU mortality by 1.8-3.6% for sepsis patients.' },
    { paper_title: 'Bias and Fairness in Healthcare ML', findings: 'Racial disparities in health algorithms affect nearly half of Black patients in risk prediction.' },
  ],
  contradictions: [
    {
      description: 'Li et al. claim deep learning models are ready for clinical deployment, while Obermeyer et al. argue that unaddressed bias makes deployment premature and potentially harmful.',
      papers: ['Deep Learning for Medical Image Analysis', 'Bias and Fairness in Healthcare ML'],
    },
    {
      description: 'Rieke et al. report federated learning maintains high accuracy, while Gu et al. suggest data heterogeneity across institutions significantly degrades model performance.',
      papers: ['Federated Learning for EHR', 'Transformer Models for Clinical NLP'],
    },
  ],
  research_gaps: [
    { description: 'Limited research on long-term real-world outcomes of ML-guided clinical decisions beyond controlled trials.' },
    { description: 'Insufficient exploration of multi-modal learning combining imaging, EHR, and genomic data in unified frameworks.' },
    { description: 'Lack of standardized evaluation benchmarks for comparing healthcare ML models across different institutions and demographics.' },
    { description: 'Need for interpretable AI methods that provide clinician-understandable explanations in critical care settings.' },
  ],
  synthesis: 'Machine learning is transforming healthcare across multiple domains, from medical imaging to clinical decision support. Deep learning models now achieve expert-level performance in diagnostic tasks, while federated learning enables privacy-preserving collaboration across institutions. However, significant challenges remain: algorithmic bias disproportionately affects vulnerable populations, and the gap between experimental performance and real-world clinical deployment remains wide. The field urgently needs standardized evaluation frameworks, interpretable models for clinical trust, and multi-modal approaches that integrate diverse data types. Future research should prioritize fairness-aware model development and longitudinal outcome studies to validate AI-guided interventions in practice.',
  overview: 'This analysis covers 5 key papers spanning medical imaging, federated learning, clinical NLP, treatment optimization, and algorithmic fairness in healthcare ML applications.',
};
