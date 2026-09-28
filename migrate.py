import os
import re

# Paths
src_dir = r"d:\Java project\expense-tracker (1)\expense-tracker\src\main\java"

# Regex patterns
imports_to_remove = [
    r'import jakarta\.persistence\.[^;]+;\n?',
    r'import org\.springframework\.data\.jpa\.repository\.[^;]+;\n?'
]

imports_to_add_entities = """import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.DBRef;
"""

imports_to_add_repos = """import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.data.mongodb.repository.Query;
"""

def process_java_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content

    # Replace imports
    for pattern in imports_to_remove:
        content = re.sub(pattern, '', content)

    if '@Entity' in content or '@Document' in original:
        content = content.replace('package com.example.expensetracker.entity;', 
                                  'package com.example.expensetracker.entity;\n\n' + imports_to_add_entities)
    
    if 'JpaRepository' in content:
        content = content.replace('package com.example.expensetracker.repository;', 
                                  'package com.example.expensetracker.repository;\n\n' + imports_to_add_repos)

    # Annotations replacement
    content = re.sub(r'@Entity', r'@Document', content)
    content = re.sub(r'@Table\(name\s*=\s*"([^"]+)"\)', r'@Document(collection = "\1")', content)
    content = re.sub(r'@GeneratedValue\([^)]*\)\s*', '', content)
    content = re.sub(r'@Column\([^)]*\)\s*', '', content)
    
    # Relationships
    content = re.sub(r'@ManyToOne\([^)]*\)\s*', '@DBRef\n    ', content)
    content = re.sub(r'@ManyToOne\s*', '@DBRef\n    ', content)
    content = re.sub(r'@OneToMany\([^)]*\)\s*', '@DBRef\n    ', content)
    content = re.sub(r'@JoinColumn\([^)]*\)\s*', '', content)
    content = re.sub(r'@OneToOne\([^)]*\)\s*', '@DBRef\n    ', content)
    content = re.sub(r'@OneToOne\s*', '@DBRef\n    ', content)

    # Data types replacement
    # Long id -> String id
    content = re.sub(r'\bLong\s+id\b', 'String id', content)
    content = re.sub(r'public\s+Long\s+getId', 'public String getId', content)
    content = re.sub(r'public\s+void\s+setId\(Long\s+', 'public void setId(String ', content)
    
    # In DTOs, controllers, services, repositories
    content = re.sub(r'JpaRepository<([^,]+),\s*Long>', r'MongoRepository<\1, String>', content)
    content = re.sub(r'findById\(Long\s+', 'findById(String ', content)
    content = re.sub(r'deleteById\(Long\s+', 'deleteById(String ', content)
    content = re.sub(r'findByIdAndUserId\(Long\s+', 'findByIdAndUserId(String ', content)
    content = re.sub(r'Long\s+userId', 'String userId', content) # Change userId everywhere if ID is String

    # Catching Long variables named *Id
    content = re.sub(r'\bLong\s+(\w*Id)\b', r'String \1', content)
    # Getters and setters for *Id
    content = re.sub(r'public\s+Long\s+get(\w+Id)\(', r'public String get\1(', content)
    content = re.sub(r'public\s+void\s+set(\w+Id)\(Long\s+', r'public void set\1(String ', content)

    # ResponseEntity methods
    content = re.sub(r'@PathVariable\s+Long\s+(\w+)', r'@PathVariable String \1', content)

    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Updated: {filepath}")

for root, dirs, files in os.walk(src_dir):
    for file in files:
        if file.endswith('.java'):
            process_java_file(os.path.join(root, file))

print("Done")
